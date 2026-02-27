const axios = require("axios");

exports.main = async (context = {}) => {
  const { unitEnrolmentId } = context.parameters;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;

  console.log(
    "fetchUnitWorkshops called with unitEnrolmentId:",
    unitEnrolmentId,
  );

  if (!unitEnrolmentId) {
    return {
      status: "error",
      message: "Missing required parameter: unitEnrolmentId",
    };
  }

  const OBJECT_TYPES = {
    UNIT_ENROLMENT: "2-56274552",
    WORKSHOP_ENROLMENT: "2-56274582",
  };

  const PROPERTIES = {
    UNIT_ENROLMENT: [
      "hs_object_id",
      "unit_name",
      "code",
      "workshop_enrol_id", // fallback
    ],
    WORKSHOP_ENROLMENT: [
      "hs_object_id",
      "workshop_name",
      "code",
      "email",
      "given_name",
      "enrol_id",
      "hrwl_outcome",
      "status",
      "start_date",
      "finish_date",
      "delivery",
      "amount_paid",
    ],
  };

  try {
    // Step 1: Fetch the unit enrolment (for context, optional)
    const unitResponse = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPES.UNIT_ENROLMENT}/${unitEnrolmentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: {
          properties: PROPERTIES.UNIT_ENROLMENT.join(","),
          archived: false,
        },
      },
    );

    const unitEnrolment = {
      id: unitResponse.data.id,
      hs_object_id: unitResponse.data.id,
      ...mapProperties(unitResponse.data.properties),
    };

    // Step 2: Get workshop enrolment IDs
    let workshopIds = [];

    // Try associations first
    try {
      const workshopAssoc = await axios.get(
        `https://api.hubapi.com/crm/v4/objects/${OBJECT_TYPES.UNIT_ENROLMENT}/${unitEnrolmentId}/associations/${OBJECT_TYPES.WORKSHOP_ENROLMENT}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          params: { limit: 100 },
        },
      );
      workshopIds = workshopAssoc.data?.results?.map((r) => r.toObjectId) || [];
    } catch (err) {
      // ignore
    }

    // Fallback to workshop_enrol_id property (may contain comma-separated IDs)
    if (workshopIds.length === 0 && unitEnrolment.workshop_enrol_id) {
      if (unitEnrolment.workshop_enrol_id.includes(",")) {
        workshopIds = unitEnrolment.workshop_enrol_id
          .split(",")
          .map((id) => id.trim());
      } else {
        workshopIds = [unitEnrolment.workshop_enrol_id];
      }
    }

    let workshops = [];
    if (workshopIds.length > 0) {
      workshops = await fetchObjectsByIds(
        OBJECT_TYPES.WORKSHOP_ENROLMENT,
        workshopIds,
        PROPERTIES.WORKSHOP_ENROLMENT,
        token,
      );
    }

    // Step 3: Search contacts by email and attach contact_data
    const allEmails = workshops.map((w) => w.email).filter((e) => e);
    const emailToContactMap = await searchContactsByEmails(allEmails, token);

    const enrichedWorkshops = workshops.map((w) => ({
      ...w,
      contact_data: w.email
        ? emailToContactMap[w.email.toLowerCase()] || null
        : null,
    }));

    return {
      status: "success",
      unitEnrolment,
      workshops: enrichedWorkshops,
      summary: {
        totalWorkshops: workshops.length,
      },
    };
  } catch (err) {
    console.error("Error in fetchUnitWorkshops:", {
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

// ---------- Helper Functions ----------
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
