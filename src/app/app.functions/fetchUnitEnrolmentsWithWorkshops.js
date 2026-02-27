const axios = require("axios");

exports.main = async (context = {}) => {
  const { classEnrolmentId } = context.parameters;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;

  console.log(
    "fetchUnitEnrolmentsWithWorkshops called with classEnrolmentId:",
    classEnrolmentId,
  );

  if (!classEnrolmentId) {
    return {
      status: "error",
      message: "Missing required parameter: classEnrolmentId",
    };
  }

  // ---------- CONFIGURATION: ADAPT THESE IDs TO YOUR HUBSPOT OBJECTS ----------
  const OBJECT_TYPES = {
    CLASS_ENROLMENT: "2-56274502", // Class Enrolment (top level)
    UNIT_ENROLMENT: "2-56274552", // Unit Enrolment
    WORKSHOP_ENROLMENT: "2-56274582", // Workshop Enrolment – REPLACE WITH YOUR ACTUAL OBJECT TYPE ID
  };

  // Properties for each object – updated for Workshop Enrolment based on your CSV
  const PROPERTIES = {
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
      "workshop_enrol_id", // may contain workshop enrolment ID
      "workshop_id",
      "axce_contact_id",
      "hs_createdate",
    ],
    WORKSHOP_ENROLMENT: [
      "hs_object_id",
      "workshop_name", // from CSV: "Workshop Name"
      "email", // from CSV: "Email"
      "given_name", // from CSV: "Given Name"
      "enrol_id", // from CSV: "Enrol ID"
      "hrwl_outcome", // from CSV: "HRWL Outcome"
      "status", // from CSV: "Status"
      "start_date", // from CSV: "Start Date"
      "finish_date", // from CSV: "Finish Date"
      // Include any other standard properties you need
      "hs_createdate",
    ],
  };
  // ---------------------------------------------------------------------------

  try {
    // Step 1: Fetch the class enrolment record itself
    const classEnrolmentResponse = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPES.CLASS_ENROLMENT}/${classEnrolmentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: {
          properties: PROPERTIES.CLASS_ENROLMENT.join(","),
          archived: false,
        },
      },
    );

    const classEnrolment = {
      id: classEnrolmentResponse.data.id,
      hs_object_id: classEnrolmentResponse.data.id,
      ...mapProperties(classEnrolmentResponse.data.properties),
    };
console.log(classEnrolment);
    // Step 2: Get associated unit enrolments
    const unitAssociations = await axios.get(
      `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.CLASS_ENROLMENT}/${classEnrolmentId}/associations/${OBJECT_TYPES.UNIT_ENROLMENT}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: { limit: 100 },
      },
    );

    const unitEnrolmentIds =
      unitAssociations.data?.results?.map((r) => r.toObjectId) || [];
    console.log(`Found ${unitEnrolmentIds.length} unit enrolments`);

    // Step 3: Fetch details of all unit enrolments (with batching)
    const unitEnrolments = await fetchObjectsByIds(
      OBJECT_TYPES.UNIT_ENROLMENT,
      unitEnrolmentIds,
      PROPERTIES.UNIT_ENROLMENT,
      token,
    );

    // Step 4: For each unit enrolment, fetch its workshop enrolments
    const workshopEnrolmentsByUnit = {};
    const allEmails = new Set();

    // Add class enrolment email for contact search
    if (classEnrolment.email) allEmails.add(classEnrolment.email.toLowerCase());

    for (const unit of unitEnrolments) {
      if (unit.email) allEmails.add(unit.email.toLowerCase());

      // Try to get workshop enrolments via association first
      let workshopIds = [];
      try {
        const workshopAssoc = await axios.get(
          `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.UNIT_ENROLMENT}/${unit.hs_object_id}/associations/${OBJECT_TYPES.WORKSHOP_ENROLMENT}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            params: { limit: 100 },
          },
        );
        workshopIds =
          workshopAssoc.data?.results?.map((r) => r.toObjectId) || [];
      } catch (err) {
        // If association fails, try using property workshop_enrol_id as fallback
        if (unit.workshop_enrol_id) {
          workshopIds = [unit.workshop_enrol_id];
        }
      }

      if (workshopIds.length > 0) {
        const workshops = await fetchObjectsByIds(
          OBJECT_TYPES.WORKSHOP_ENROLMENT,
          workshopIds,
          PROPERTIES.WORKSHOP_ENROLMENT,
          token,
        );
        workshopEnrolmentsByUnit[unit.hs_object_id] = workshops;

        // Collect emails for contact search
        workshops.forEach((w) => {
          if (w.email) allEmails.add(w.email.toLowerCase());
        });
      } else {
        workshopEnrolmentsByUnit[unit.hs_object_id] = [];
      }

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Step 5: Search contacts by all collected emails
    const emailToContactMap = await searchContactsByEmails(
      Array.from(allEmails),
      token,
    );

    // Step 6: Attach contact data to all records
    const enrichWithContact = (obj) => ({
      ...obj,
      contact_data: obj.email
        ? emailToContactMap[obj.email.toLowerCase()] || null
        : null,
    });

    const enrichedClassEnrolment = enrichWithContact(classEnrolment);
    const enrichedUnitEnrolments = unitEnrolments.map(enrichWithContact);

    const enrichedWorkshops = {};
    Object.keys(workshopEnrolmentsByUnit).forEach((unitId) => {
      enrichedWorkshops[unitId] =
        workshopEnrolmentsByUnit[unitId].map(enrichWithContact);
    });

    return {
      status: "success",
      classEnrolment: enrichedClassEnrolment,
      unitEnrolments: enrichedUnitEnrolments,
      workshopEnrolmentsByUnit: enrichedWorkshops,
      summary: {
        totalUnitEnrolments: unitEnrolments.length,
        totalWorkshopEnrolments: Object.values(enrichedWorkshops).flat().length,
      },
    };
  } catch (err) {
    console.error(
      "Error in fetchUnitEnrolmentsWithWorkshops:",
      err.response?.data || err.message,
    );
    return {
      status: "error",
      message:
        err.response?.data?.message || err.message || "Failed to fetch data",
    };
  }
};

// ---------- HELPER FUNCTIONS (unchanged) ----------

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
                {
                  propertyName: "hs_object_id",
                  operator: "IN",
                  values: batch,
                },
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
      console.error(`Error fetching batch of ${objectType}:`, err.message);
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

  console.log(`Searching for ${uniqueEmails.length} contacts by email`);

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
                {
                  propertyName: "email",
                  operator: "IN",
                  values: batch,
                },
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
