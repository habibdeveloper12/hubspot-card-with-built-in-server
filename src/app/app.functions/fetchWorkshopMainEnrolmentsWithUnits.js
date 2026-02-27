const axios = require("axios");

exports.main = async (context = {}) => {
  const { workshopId } = context.parameters;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;

  console.log(
    "fetchWorkshopEnrolmentsWithUnits called with workshopId:",
    workshopId,
  );

  if (!workshopId) {
    return {
      status: "error",
      message: "Missing required parameter: workshopId",
    };
  }

  // ---------- CONFIGURATION: ADAPT THESE IDs TO YOUR HUBSPOT OBJECTS ----------
  const OBJECT_TYPES = {
    WORKSHOP: "2-56274040",
    WORKSHOP_ENROLMENT: "2-56274582",
    UNIT_ENROLMENT: "2-56274552",
    CONTACT: "0-1",
  };

  const PROPERTIES = {
    WORKSHOP: [
      "hs_object_id",
      "workshop_name",
      "workshop_code",
      "start_date",
      "end_date",
      "status",
      "location",
      "duration",
      "qualification",
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
      "unit_enrolment_id", // optional fallback
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
      "amount_paid",
    ],
    CONTACT: ["firstname", "lastname", "email", "hs_object_id"],
  };
  // ---------------------------------------------------------------------------

  try {
    // Step 1: Fetch workshop details
    const workshopResponse = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPES.WORKSHOP}/${workshopId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: {
          properties: PROPERTIES.WORKSHOP.join(","),
          archived: false,
        },
      },
    );

    const workshop = {
      id: workshopResponse.data.id,
      hs_object_id: workshopResponse.data.id,
      ...mapProperties(workshopResponse.data.properties),
    };

    // Step 2: Get associated Workshop Enrolment IDs
    let workshopEnrolmentIds = [];
    try {
      const associations = await axios.get(
        `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.WORKSHOP}/${workshopId}/associations/${OBJECT_TYPES.WORKSHOP_ENROLMENT}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          params: { limit: 100 },
        },
      );
      workshopEnrolmentIds =
        associations.data?.results?.map((r) => r.toObjectId) || [];
      console.log(
        `Found ${workshopEnrolmentIds.length} workshop enrolments via association`,
      );
    } catch (err) {
      console.log("No associations found");
    }

    if (workshopEnrolmentIds.length === 0) {
      return {
        status: "success",
        workshop,
        workshopEnrolments: [],
        summary: {
          totalWorkshopEnrolments: 0,
        },
      };
    }

    // Step 3: Fetch details of all Workshop Enrolments
    const workshopEnrolments = await fetchObjectsByIds(
      OBJECT_TYPES.WORKSHOP_ENROLMENT,
      workshopEnrolmentIds,
      PROPERTIES.WORKSHOP_ENROLMENT,
      token,
    );

    // Step 4: For each Workshop Enrolment, fetch its associated Unit Enrolment
    const unitEnrolmentIds = new Set();
    const workshopEnrolmentsWithUnit = [];

    for (const we of workshopEnrolments) {
      let unitId = null;

      // Try association first (Workshop Enrolment -> Unit Enrolment)
      try {
        const unitAssoc = await axios.get(
          `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.WORKSHOP_ENROLMENT}/${we.hs_object_id}/associations/${OBJECT_TYPES.UNIT_ENROLMENT}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            params: { limit: 1 },
          },
        );
        if (unitAssoc.data?.results?.length > 0) {
          unitId = unitAssoc.data.results[0].toObjectId;
        }
      } catch (err) {
        // Fallback to property
        if (we.unit_enrolment_id) {
          unitId = we.unit_enrolment_id;
        }
      }

      if (unitId) {
        unitEnrolmentIds.add(unitId);
        workshopEnrolmentsWithUnit.push({
          ...we,
          unit_enrolment_id: unitId,
        });
      } else {
        workshopEnrolmentsWithUnit.push({
          ...we,
          unit_enrolment_id: null,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Step 5: Fetch all unique Unit Enrolments
    const unitEnrolments = await fetchObjectsByIds(
      OBJECT_TYPES.UNIT_ENROLMENT,
      Array.from(unitEnrolmentIds),
      PROPERTIES.UNIT_ENROLMENT,
      token,
    );

    // Map unit enrolment by ID
    const unitMap = {};
    unitEnrolments.forEach((ue) => {
      unitMap[ue.hs_object_id] = ue;
    });

    // Step 6: Optionally fetch contact details for each workshop enrolment (for student info)
    const contactEmails = workshopEnrolmentsWithUnit
      .map((we) => we.email)
      .filter((email) => email && email.trim() !== "");
    const emailToContactMap = await searchContactsByEmails(
      contactEmails,
      token,
    );

    // Attach contact data and unit data to each workshop enrolment
    const enrichedWorkshopEnrolments = workshopEnrolmentsWithUnit.map((we) => ({
      ...we,
      unit_enrolment: we.unit_enrolment_id
        ? unitMap[we.unit_enrolment_id] || null
        : null,
      contact_data: we.email
        ? emailToContactMap[we.email.toLowerCase()] || null
        : null,
    }));

    return {
      status: "success",
      workshop,
      workshopEnrolments: enrichedWorkshopEnrolments,
      summary: {
        totalWorkshopEnrolments: enrichedWorkshopEnrolments.length,
      },
    };
  } catch (err) {
    console.error(
      "Error in fetchWorkshopEnrolmentsWithUnits:",
      err.response?.data || err.message,
    );
    return {
      status: "error",
      message:
        err.response?.data?.message || err.message || "Failed to fetch data",
    };
  }
};

// ---------- HELPER FUNCTIONS (reused) ----------

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
