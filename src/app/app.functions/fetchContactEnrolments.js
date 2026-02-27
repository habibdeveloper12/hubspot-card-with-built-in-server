const axios = require("axios");

exports.main = async (context = {}) => {
  const { contactId } = context.parameters;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;

  console.log("fetchContactEnrolments called with contactId:", contactId);

  if (!contactId) {
    return {
      status: "error",
      message: "Missing required parameter: contactId",
    };
  }

  const OBJECT_TYPES = {
    CONTACT: "0-1",
    CLASS: "2-56273605",
    CLASS_ENROLMENT: "2-56274502",
    UNIT_ENROLMENT: "2-56274552",
    WORKSHOP_ENROLMENT: "2-56274582",
  };

  const PROPERTIES = {
    CONTACT: ["email", "firstname", "lastname", "hs_object_id"],
    CLASS: [
      "hs_object_id",
      "class_name",
      "class_start_date",
      "class_end_date",
      "location",
      "status",
      "duration",
      "qualification",
    ],
    CLASS_ENROLMENT: [
      "hs_object_id",
      "class_name",
      "given_name",
      "surname",
      "email",
      "start_date",
      "finish_date",
      "status",
      "hubspot_contact_id",
      "mobile_phone",
      "preferred_name",
      "student_enrolment_id",
      "amount_paid",
      "qualification_id",
      "qualification_code",
      "delivery_method",
      "axce_contact_id",
      "axce_instance_id",
      "class_id", // ✅ ADDED to link to class
      "hs_createdate",
    ],
    UNIT_ENROLMENT: [
      "hs_object_id",
      "unit_name",
      "code",
      "given_name",
      "surname",
      "email",
      "start_date",
      "finish_date",
      "status",
      "enrolment_date",
      "class_id",
      "class_enrol_id",
      "enrol_id",
      "unit_id",
      "hubspot_contact_id",
      "mobile_phone",
      "amount_paid",
      "delivery",
      "workshop_enrol_id",
      "workshop_id",
      "axce_contact_id",
      "hs_createdate",
    ],
    WORKSHOP_ENROLMENT: [
      "hs_object_id",
      "workshop_name",
      "email",
      "given_name",
      "enrol_id",
      "hrwl_outcome",
      "status",
      "start_date",
      "finish_date",
      "hs_createdate",
    ],
  };

  try {
    // Step 1: Fetch contact details
    const contactResponse = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPES.CONTACT}/${contactId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: { properties: PROPERTIES.CONTACT.join(","), archived: false },
      },
    );
    const contact = {
      id: contactResponse.data.id,
      hs_object_id: contactResponse.data.id,
      ...mapProperties(contactResponse.data.properties),
    };

    // Step 2: Get class enrolment IDs for this contact
    let classEnrolmentIds = [];

    // Try associations
    try {
      const assoc = await axios.get(
        `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.CONTACT}/${contactId}/associations/${OBJECT_TYPES.CLASS_ENROLMENT}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          params: { limit: 100 },
        },
      );
      classEnrolmentIds = assoc.data?.results?.map((r) => r.toObjectId) || [];
    } catch (err) {
      /* ignore */
    }

    // Fallback: search by contact's email
    if (classEnrolmentIds.length === 0 && contact.email) {
      try {
        const searchRes = await axios.post(
          `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPES.CLASS_ENROLMENT}/search`,
          {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: "email",
                    operator: "EQ",
                    value: contact.email,
                  },
                ],
              },
            ],
            properties: ["hs_object_id"],
            limit: 100,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
        classEnrolmentIds = searchRes.data?.results?.map((r) => r.id) || [];
      } catch (err) {
        /* ignore */
      }
    }

    if (classEnrolmentIds.length === 0) {
      return {
        status: "success",
        contact,
        classEnrolments: [],
        summary: {
          totalClassEnrolments: 0,
          totalUnitEnrolments: 0,
          totalWorkshopEnrolments: 0,
        },
      };
    }

    // Step 3: Fetch all class enrolments
    const classEnrolments = await fetchObjectsByIds(
      OBJECT_TYPES.CLASS_ENROLMENT,
      classEnrolmentIds,
      PROPERTIES.CLASS_ENROLMENT,
      token,
    );

    // Step 4: Map each class enrolment to its class (or "unknown")
    const classIdToEnrolments = {};
    const classIdsSet = new Set();
    const enrolmentIdToClassId = new Map(); // NEW: map enrolment ID to class ID

    for (const ce of classEnrolments) {
      let classId = null;
      // Try association first
      try {
        const assoc = await axios.get(
          `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.CLASS_ENROLMENT}/${ce.hs_object_id}/associations/${OBJECT_TYPES.CLASS}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            params: { limit: 1 },
          },
        );
        if (assoc.data?.results?.length > 0) {
          classId = assoc.data.results[0].toObjectId;
        }
      } catch (err) {
        /* ignore */
      }

      // Fallback to property (class_id)
      if (!classId && ce.class_id) {
        classId = ce.class_id;
      }

      if (classId) {
        classIdsSet.add(classId);
        if (!classIdToEnrolments[classId]) classIdToEnrolments[classId] = [];
        classIdToEnrolments[classId].push(ce);
        enrolmentIdToClassId.set(ce.hs_object_id, classId);
      } else {
        // No class found – use placeholder
        const unknownId = "unknown";
        classIdsSet.add(unknownId);
        if (!classIdToEnrolments[unknownId])
          classIdToEnrolments[unknownId] = [];
        classIdToEnrolments[unknownId].push(ce);
        enrolmentIdToClassId.set(ce.hs_object_id, unknownId);
      }
    }

    // Step 5: Fetch real class details
    const realClassIds = Array.from(classIdsSet).filter(
      (id) => id !== "unknown",
    );
    let classes = [];
    if (realClassIds.length > 0) {
      classes = await fetchObjectsByIds(
        OBJECT_TYPES.CLASS,
        realClassIds,
        PROPERTIES.CLASS,
        token,
      );
    }

    // Add placeholder for unknown class if needed
    if (classIdsSet.has("unknown")) {
      classes.push({
        hs_object_id: "unknown",
        class_name: "Unknown Class",
        status: "",
        class_start_date: "",
        class_end_date: "",
        location: "",
        qualification: "",
      });
    }

    const classMap = Object.fromEntries(
      classes.map((c) => [c.hs_object_id, c]),
    );

    // Step 6: For each class enrolment, fetch its unit enrolments
    const unitEnrolmentsByClassEnrolment = {};
    const allUnits = [];

    for (const ce of classEnrolments) {
      let unitIds = [];
      try {
        const assoc = await axios.get(
          `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.CLASS_ENROLMENT}/${ce.hs_object_id}/associations/${OBJECT_TYPES.UNIT_ENROLMENT}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            params: { limit: 100 },
          },
        );
        unitIds = assoc.data?.results?.map((r) => r.toObjectId) || [];
      } catch (err) {
        /* ignore */
      }

      if (unitIds.length > 0) {
        const units = await fetchObjectsByIds(
          OBJECT_TYPES.UNIT_ENROLMENT,
          unitIds,
          PROPERTIES.UNIT_ENROLMENT,
          token,
        );
        unitEnrolmentsByClassEnrolment[ce.hs_object_id] = units;
        allUnits.push(...units);
      } else {
        unitEnrolmentsByClassEnrolment[ce.hs_object_id] = [];
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Step 7: For each unit, fetch its workshop enrolments
    const workshopEnrolmentsByUnit = {};
    const unitMap = Object.fromEntries(
      allUnits.map((u) => [u.hs_object_id, u]),
    );

    for (const unitId of Object.keys(unitMap)) {
      const unit = unitMap[unitId];
      let workshopIds = [];

      // Try associations
      try {
        const assoc = await axios.get(
          `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.UNIT_ENROLMENT}/${unitId}/associations/${OBJECT_TYPES.WORKSHOP_ENROLMENT}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            params: { limit: 100 },
          },
        );
        workshopIds = assoc.data?.results?.map((r) => r.toObjectId) || [];
      } catch (err) {
        /* ignore */
      }

      // Fallback to property
      if (workshopIds.length === 0 && unit.workshop_enrol_id) {
        workshopIds = [unit.workshop_enrol_id];
      }

      if (workshopIds.length > 0) {
        const workshops = await fetchObjectsByIds(
          OBJECT_TYPES.WORKSHOP_ENROLMENT,
          workshopIds,
          PROPERTIES.WORKSHOP_ENROLMENT,
          token,
        );
        workshopEnrolmentsByUnit[unitId] = workshops;
      } else {
        workshopEnrolmentsByUnit[unitId] = [];
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Step 8: Build flattened list of class enrolments with units and workshops
    const classEnrolmentsWithDetails = classEnrolments.map((ce) => {
      const classId = enrolmentIdToClassId.get(ce.hs_object_id);
      return {
        ...ce,
        units: (unitEnrolmentsByClassEnrolment[ce.hs_object_id] || []).map(
          (u) => ({
            ...u,
            workshops: workshopEnrolmentsByUnit[u.hs_object_id] || [],
          }),
        ),
        class: classMap[classId] || null, // attach class object (may be "unknown")
      };
    });

    // Step 9: Search contacts by email for all units and workshops
    const allEmails = new Set();
    classEnrolmentsWithDetails.forEach((ce) => {
      if (ce.email) allEmails.add(ce.email.toLowerCase());
      ce.units.forEach((u) => {
        if (u.email) allEmails.add(u.email.toLowerCase());
        u.workshops.forEach((w) => {
          if (w.email) allEmails.add(w.email.toLowerCase());
        });
      });
    });

    const emailToContactMap = await searchContactsByEmails(
      Array.from(allEmails),
      token,
    );

    // Attach contact data
    const finalClassEnrolments = classEnrolmentsWithDetails.map((ce) => ({
      ...ce,
      contact_data: ce.email
        ? emailToContactMap[ce.email.toLowerCase()] || null
        : null,
      units: ce.units.map((u) => ({
        ...u,
        contact_data: u.email
          ? emailToContactMap[u.email.toLowerCase()] || null
          : null,
        workshops: u.workshops.map((w) => ({
          ...w,
          contact_data: w.email
            ? emailToContactMap[w.email.toLowerCase()] || null
            : null,
        })),
      })),
    }));


    return {
      status: "success",
      contact,
      classEnrolments: finalClassEnrolments,
      summary: {
        totalClassEnrolments: finalClassEnrolments.length,
        totalUnitEnrolments: allUnits.length,
        totalWorkshopEnrolments: Object.values(workshopEnrolmentsByUnit).flat()
          .length,
      },
    };
  } catch (err) {
    console.error(
      "Error in fetchContactEnrolments:",
      err.response?.data || err.message,
    );
    return {
      status: "error",
      message:
        err.response?.data?.message || err.message || "Failed to fetch data",
    };
  }
};

// ---------- Helper Functions (unchanged) ----------
async function fetchObjectsByIds(objectType, ids, properties, token) {
  if (!ids || ids.length === 0) return [];

  const results = [];
  const batchSize = 100;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    try {
      const response = await axios.post(
        `https://api.hubapi.com/crm/v3/objects/${objectType}/search`,
        {
          filterGroups: [
            {
              filters: [
                { propertyName: "hs_object_id", operator: "IN", values: batch },
              ],
            },
          ],
          properties: properties,
          limit: batchSize,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      const mapped = (response.data?.results || []).map((item) => ({
        id: item.id,
        hs_object_id: item.id,
        ...mapProperties(item.properties),
      }));

      results.push(...mapped);
    } catch (err) {
      console.error(`Error fetching batch of ${objectType}:`, {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
      });
    }
    if (i + batchSize < ids.length)
      await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}

function mapProperties(props) {
  const result = {};
  for (const [key, value] of Object.entries(props)) {
    result[key] = value;
  }
  return result;
}

async function searchContactsByEmails(emails, token) {
  if (!emails || emails.length === 0) return {};

  const uniqueEmails = [...new Set(emails.filter((e) => e && e.trim()))];
  if (uniqueEmails.length === 0) return {};

  const emailToContactMap = {};
  const batchSize = 100;

  for (let i = 0; i < uniqueEmails.length; i += batchSize) {
    const batch = uniqueEmails.slice(i, i + batchSize);
    try {
      const response = await axios.post(
        "https://api.hubapi.com/crm/v3/objects/contacts/search",
        {
          filterGroups: [
            {
              filters: [
                { propertyName: "email", operator: "IN", values: batch },
              ],
            },
          ],
          properties: [
            "firstname",
            "lastname",
            "email",
            "phone",
            "hs_object_id",
            "createdate",
          ],
          limit: batchSize,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      (response.data?.results || []).forEach((contact) => {
        const email = contact.properties.email;
        if (email) {
          emailToContactMap[email.toLowerCase()] = {
            id: contact.id,
            hs_object_id: contact.id,
            firstname: contact.properties.firstname || "",
            lastname: contact.properties.lastname || "",
            email: email,
            phone: contact.properties.phone || "",
            createdate: contact.properties.createdate || "",
            fullname:
              `${contact.properties.firstname || ""} ${contact.properties.lastname || ""}`.trim() ||
              email,
          };
        }
      });
    } catch (err) {
      console.error("Error searching contacts batch:", err.message);
    }
    if (i + batchSize < uniqueEmails.length)
      await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`Found ${Object.keys(emailToContactMap).length} contacts`);
  return emailToContactMap;
}
