const axios = require("axios");

exports.main = async (context = {}) => {
  const { workshopEnrolmentId } = context.parameters;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;

  console.log(
    "fetchWorkshopUnits called with workshopEnrolmentId:",
    workshopEnrolmentId,
  );

  if (!workshopEnrolmentId) {
    return {
      status: "error",
      message: "Missing required parameter: workshopEnrolmentId",
    };
  }

  const OBJECT_TYPES = {
    WORKSHOP_ENROLMENT: "2-56274582",
    UNIT_ENROLMENT: "2-56274552",
    CLASS_ENROLMENT: "2-56274502",
    CLASS: "2-56273605",
  };

  const PROPERTIES = {
    WORKSHOP_ENROLMENT: [
      "hs_object_id",
      "workshop_name",
      "code",
      "email",
      "status",
    ],
    UNIT_ENROLMENT: [
      "hs_object_id",
      "unit_name",
      "code",
      "email",
      "given_name",
      "surname",
      "status",
      "start_date",
      "finish_date",
      "amount_paid",
      // No class_enrol_id – use associations only
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
      "student_enrolment_id",
      "amount_paid",
    ],
    CLASS: [
      "hs_object_id",
      "class_name",
      "class_start_date",
      "class_end_date",
      "location",
      "status",
      "qualification",
    ],
  };

  try {
    // Step 1: Fetch workshop enrolment
    const workshopResponse = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPES.WORKSHOP_ENROLMENT}/${workshopEnrolmentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: {
          properties: PROPERTIES.WORKSHOP_ENROLMENT.join(","),
          archived: false,
        },
      },
    );

    const workshopEnrolment = {
      id: workshopResponse.data.id,
      hs_object_id: String(workshopResponse.data.id),
      ...mapProperties(workshopResponse.data.properties),
    };

    // Step 2: Find unit enrolments linked to this workshop
    let unitIds = [];

    // Try associations first
    try {
      const assoc = await axios.get(
        `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.WORKSHOP_ENROLMENT}/${workshopEnrolmentId}/associations/${OBJECT_TYPES.UNIT_ENROLMENT}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          params: { limit: 100 },
        },
      );
      unitIds = assoc.data?.results?.map((r) => String(r.toObjectId)) || [];
      console.log(`Found ${unitIds.length} unit enrolments via association`);
    } catch (err) {
      console.log("No unit associations found, trying property fallback");
    }

    // Fallback: search by workshop_enrol_id property on unit enrolment
    if (unitIds.length === 0) {
      try {
        const searchRes = await axios.post(
          `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPES.UNIT_ENROLMENT}/search`,
          {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: "workshop_enrol_id",
                    operator: "EQ",
                    value: workshopEnrolmentId,
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
        unitIds = searchRes.data?.results?.map((r) => String(r.id)) || [];
        console.log(
          `Found ${unitIds.length} unit enrolments via property search`,
        );
      } catch (err) {
        console.log("Fallback search failed");
      }
    }

    if (unitIds.length === 0) {
      console.log("No unit enrolments found for this workshop");
      return {
        status: "success",
        workshopEnrolment,
        units: [],
        summary: { totalUnits: 0 },
      };
    }

    // Fetch unit enrolment details
    const units = await fetchObjectsByIds(
      OBJECT_TYPES.UNIT_ENROLMENT,
      unitIds,
      PROPERTIES.UNIT_ENROLMENT,
      token,
    );
    console.log(`Fetched ${units.length} unit enrolments`);

    // Step 3: For each unit, get its class enrolment ID via association only
    const unitToClassEnrolmentId = new Map();
    const allClassEnrolmentIds = new Set();

    for (const unit of units) {
      let classEnrolmentId = null;
      try {
        const assoc = await axios.get(
          `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.UNIT_ENROLMENT}/${unit.hs_object_id}/associations/${OBJECT_TYPES.CLASS_ENROLMENT}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            params: { limit: 1 },
          },
        );
        if (assoc.data?.results?.length > 0) {
          classEnrolmentId = String(assoc.data.results[0].toObjectId);
          console.log(
            `Unit ${unit.hs_object_id} associated with class enrolment ${classEnrolmentId}`,
          );
        } else {
          console.log(
            `No class enrolment association found for unit ${unit.hs_object_id}`,
          );
        }
      } catch (err) {
        console.error(
          `Error fetching class enrolment association for unit ${unit.hs_object_id}:`,
          err.message,
        );
      }

      if (classEnrolmentId) {
        unitToClassEnrolmentId.set(unit.hs_object_id, classEnrolmentId);
        allClassEnrolmentIds.add(classEnrolmentId);
      }
    }

    console.log(
      "unitToClassEnrolmentId entries:",
      Array.from(unitToClassEnrolmentId.entries()),
    );
    console.log(
      "Unique class enrolment IDs:",
      Array.from(allClassEnrolmentIds),
    );

    // Fetch all class enrolments
    let classEnrolments = [];
    if (allClassEnrolmentIds.size > 0) {
      classEnrolments = await fetchObjectsByIds(
        OBJECT_TYPES.CLASS_ENROLMENT,
        Array.from(allClassEnrolmentIds),
        PROPERTIES.CLASS_ENROLMENT,
        token,
      );
      console.log(`Fetched ${classEnrolments.length} class enrolments`);
    } else {
      console.log("No class enrolment IDs to fetch");
    }

    const classEnrolmentMap = new Map(
      classEnrolments.map((ce) => [String(ce.hs_object_id), ce]),
    );

    // Step 4: For each class enrolment, find its class via association
    const classEnrolmentToClassId = new Map();
    const allClassIds = new Set();

    for (const ce of classEnrolments) {
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
          const classId = String(assoc.data.results[0].toObjectId);
          allClassIds.add(classId);
          classEnrolmentToClassId.set(ce.hs_object_id, classId);
          console.log(
            `Class enrolment ${ce.hs_object_id} linked to class ${classId}`,
          );
        } else {
          console.log(`No class linked to class enrolment ${ce.hs_object_id}`);
        }
      } catch (err) {
        console.error(
          `Error fetching class association for class enrolment ${ce.hs_object_id}:`,
          err.message,
        );
      }
    }

    // Fetch all classes
    let classes = [];
    if (allClassIds.size > 0) {
      classes = await fetchObjectsByIds(
        OBJECT_TYPES.CLASS,
        Array.from(allClassIds),
        PROPERTIES.CLASS,
        token,
      );
      console.log(`Fetched ${classes.length} classes`);
    }

    const classMap = new Map(
      classes.map((cls) => [String(cls.hs_object_id), cls]),
    );

    // Step 5: Enrich units with class enrolment and class details
    const enrichedUnits = units.map((unit) => {
      const classEnrolmentId = unitToClassEnrolmentId.get(unit.hs_object_id);
      console.log(
        `Looking up classEnrolmentId ${classEnrolmentId} in classEnrolmentMap`,
      );
      const classEnrolment = classEnrolmentId
        ? classEnrolmentMap.get(classEnrolmentId)
        : null;
      console.log(
        "classEnrolment from map:",
        classEnrolment ? classEnrolment.hs_object_id : null,
      );

      const classId = classEnrolment
        ? classEnrolmentToClassId.get(classEnrolment.hs_object_id)
        : null;
      const classObj = classId ? classMap.get(classId) : null;

      return {
        ...unit,
        class_enrolment: classEnrolment || null,
        class: classObj || null,
      };
    });

    console.log(
      "enrichedUnits:",
      enrichedUnits.map((u) => ({
        unit: u.hs_object_id,
        hasClassEnrolment: !!u.class_enrolment,
        className: u.class?.class_name,
      })),
    );

    // Step 6: Contact search by email
    const allEmails = new Set();
    enrichedUnits.forEach((unit) => {
      if (unit.email) allEmails.add(unit.email.toLowerCase());
      if (unit.class_enrolment?.email)
        allEmails.add(unit.class_enrolment.email.toLowerCase());
    });

    const emailToContactMap = await searchContactsByEmails(
      Array.from(allEmails),
      token,
    );

    const finalUnits = enrichedUnits.map((unit) => ({
      ...unit,
      contact_data: unit.email
        ? emailToContactMap[unit.email.toLowerCase()] || null
        : null,
      class_enrolment: unit.class_enrolment
        ? {
            ...unit.class_enrolment,
            contact_data: unit.class_enrolment.email
              ? emailToContactMap[unit.class_enrolment.email.toLowerCase()] ||
                null
              : null,
          }
        : null,
    }));

    return {
      status: "success",
      workshopEnrolment,
      units: finalUnits,
      summary: { totalUnits: units.length },
    };
  } catch (err) {
    console.error("Error in fetchWorkshopUnits:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
    });
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
        hs_object_id: String(item.id),
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
            hs_object_id: String(contact.id),
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
