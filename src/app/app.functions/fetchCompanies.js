const axios = require("axios");

exports.main = async (context = {}) => {
  const { classId } = context.parameters;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;

  console.log("fetchHierarchicalData called with classId:", classId);

  if (!classId) {
    return {
      status: "error",
      message: "Missing required parameter: classId",
    };
  }

  try {
    // Step 1: Get class details
    const classResponse = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/2-56273605/${classId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: {
          properties:
            "class_name,class_start_date,class_end_date,location,status,duration,qualification",
          archived: false,
        },
      },
    );

    const classData = {
      id: classResponse.data.id,
      hs_object_id: classResponse.data.id,
      name: classResponse.data.properties.class_name || "",
      start_date: classResponse.data.properties.class_start_date || "",
      end_date: classResponse.data.properties.class_end_date || "",
      location: classResponse.data.properties.location || "",
      status: classResponse.data.properties.status || "",
      duration: classResponse.data.properties.duration || "",
      qualification: classResponse.data.properties.qualification || "",
      createdate: classResponse.data.properties.hs_createdate || "",
    };

    // Step 2: Get class enrolment associations for the class
    const classEnrolmentsAssociations = await axios.get(
      `https://api.hubapi.com/crm/v4/objects/2-56273605/${classId}/associations/2-56274502`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: { limit: 100 },
      },
    );

    const classEnrolmentIds =
      classEnrolmentsAssociations.data?.results?.map(
        (result) => result.toObjectId,
      ) || [];

    console.log(
      `Found ${classEnrolmentIds.length} class enrolments for class ${classId}`,
    );

    const result = {
      class: classData,
      classEnrolments: [],
      unitEnrolmentsByClassEnrolment: {},
      summary: {
        totalClassEnrolments: 0,
        totalUnitEnrolments: 0,
      },
    };

    if (classEnrolmentIds.length > 0) {
      const classEnrolmentsData =
        await fetchClassEnrolmentsWithUnitEnrolmentsAndWorkshops(
          classEnrolmentIds,
          token,
        );
      result.classEnrolments = classEnrolmentsData.classEnrolments;
      result.unitEnrolmentsByClassEnrolment =
        classEnrolmentsData.unitEnrolmentsByClassEnrolment;
      result.summary.totalClassEnrolments =
        classEnrolmentsData.totalClassEnrolments;
      result.summary.totalUnitEnrolments =
        classEnrolmentsData.totalUnitEnrolments;
    }

    return {
      status: "success",
      ...result,
    };
  } catch (err) {
    console.error(
      "Error in fetchHierarchicalData:",
      err.response?.data || err.message,
    );
    return {
      status: "error",
      message:
        err.response?.data?.message ||
        err.message ||
        "Failed to fetch hierarchical data",
    };
  }
};

// Helper function to search for multiple contacts by email (unchanged)
async function searchContactsByEmails(emails, token) {
  if (!emails || emails.length === 0) return {};

  const uniqueEmails = [
    ...new Set(emails.filter((email) => email && email.trim() !== "")),
  ];

  if (uniqueEmails.length === 0) return {};

  console.log(`Searching for ${uniqueEmails.length} unique contacts by email`);

  const emailToContactMap = {};
  const batchSize = 100;

  for (let i = 0; i < uniqueEmails.length; i += batchSize) {
    const batch = uniqueEmails.slice(i, i + batchSize);
    try {
      const searchResponse = await axios.post(
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
          limit: 100,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      const contacts = searchResponse.data?.results || [];

      contacts.forEach((contact) => {
        const email = contact.properties.email;
        if (email) {
          const props = contact.properties || {};
          emailToContactMap[email.toLowerCase()] = {
            id: contact.id,
            hs_object_id: contact.id,
            firstname: props.firstname || "",
            lastname: props.lastname || "",
            email: email,
            phone: props.phone || "",
            createdate: props.createdate || "",
            fullname:
              `${props.firstname || ""} ${props.lastname || ""}`.trim() ||
              email,
          };
        }
      });

      if (i + batchSize < uniqueEmails.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(
        `Error searching contacts batch ${Math.floor(i / batchSize) + 1}:`,
        error.message,
      );
    }
  }

  console.log(`Total contacts found: ${Object.keys(emailToContactMap).length}`);
  return emailToContactMap;
}

// Helper to fetch objects by IDs (generic)
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

// Updated main function to include workshops
async function fetchClassEnrolmentsWithUnitEnrolmentsAndWorkshops(
  classEnrolmentIds,
  token,
) {
  // 1. Fetch class enrolment details
  const classEnrolmentsResponse = await axios.post(
    "https://api.hubapi.com/crm/v3/objects/2-56274502/search",
    {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "hs_object_id",
              operator: "IN",
              values: classEnrolmentIds,
            },
          ],
        },
      ],
      properties: [
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
      sorts: [{ propertyName: "hs_createdate", direction: "DESCENDING" }],
      limit: 100,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  const classEnrolments =
    classEnrolmentsResponse.data?.results?.map((result) => ({
      id: result.id,
      hs_object_id: result.properties.hs_object_id,
      class_name: result.properties.class_name || "",
      given_name: result.properties.given_name || "",
      surname: result.properties.surname || "",
      email: result.properties.email || "",
      start_date: result.properties.start_date || "",
      finish_date: result.properties.finish_date || "",
      status: result.properties.status || "",
      hubspot_contact_id: result.properties.hubspot_contact_id || "",
      mobile_phone: result.properties.mobile_phone || "",
      preferred_name: result.properties.preferred_name || "",
      student_enrolment_id: result.properties.student_enrolment_id || "",
      amount_paid: result.properties.amount_paid || "",
      qualification_id: result.properties.qualification_id || "",
      qualification_code: result.properties.qualification_code || "",
      delivery_method: result.properties.delivery_method || "",
      axce_contact_id: result.properties.axce_contact_id || "",
      axce_instance_id: result.properties.axce_instance_id || "",
      createdate: result.properties.hs_createdate || "",
    })) || [];

  const unitEnrolmentsByClassEnrolment = {};
  const allUnits = []; // collect all unit objects for workshop fetching
  let totalUnitEnrolments = 0;
  const allEmails = new Set();

  // Add class enrolment emails
  classEnrolments.forEach((enrolment) => {
    if (enrolment.email) allEmails.add(enrolment.email.toLowerCase());
  });

  // Process class enrolments in batches for unit enrolments
  const batchSize = 5;
  for (let i = 0; i < classEnrolments.length; i += batchSize) {
    const batch = classEnrolments.slice(i, i + batchSize);
    const promises = batch.map(async (classEnrolment) => {
      try {
        // Get unit enrolment associations for this class enrolment
        const unitAssoc = await axios.get(
          `https://api.hubapi.com/crm/v4/objects/2-56274502/${classEnrolment.hs_object_id}/associations/2-56274552`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            params: { limit: 100 },
          },
        );

        const unitEnrolmentIds =
          unitAssoc.data?.results?.map((r) => r.toObjectId) || [];

        if (unitEnrolmentIds.length === 0) {
          unitEnrolmentsByClassEnrolment[classEnrolment.hs_object_id] = [];
          return;
        }

        // Fetch unit enrolment details
        const unitResponse = await axios.post(
          "https://api.hubapi.com/crm/v3/objects/2-56274552/search",
          {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: "hs_object_id",
                    operator: "IN",
                    values: unitEnrolmentIds,
                  },
                ],
              },
            ],
            properties: [
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
            sorts: [{ propertyName: "hs_createdate", direction: "DESCENDING" }],
            limit: 100,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        const unitEnrolments =
          unitResponse.data?.results?.map((result) => ({
            id: result.id,
            hs_object_id: result.properties.hs_object_id,
            unit_name: result.properties.unit_name || "",
            code: result.properties.code || "",
            given_name: result.properties.given_name || "",
            surname: result.properties.surname || "",
            email: result.properties.email || "",
            start_date: result.properties.start_date || "",
            finish_date: result.properties.finish_date || "",
            status: result.properties.status || "",
            enrolment_date: result.properties.enrolment_date || "",
            class_id: result.properties.class_id || "",
            class_enrol_id: result.properties.class_enrol_id || "",
            enrol_id: result.properties.enrol_id || "",
            unit_id: result.properties.unit_id || "",
            hubspot_contact_id: result.properties.hubspot_contact_id || "",
            mobile_phone: result.properties.mobile_phone || "",
            amount_paid: result.properties.amount_paid || "",
            delivery: result.properties.delivery || "",
            workshop_enrol_id: result.properties.workshop_enrol_id || "",
            workshop_id: result.properties.workshop_id || "",
            axce_contact_id: result.properties.axce_contact_id || "",
            createdate: result.properties.hs_createdate || "",
          })) || [];

        unitEnrolmentsByClassEnrolment[classEnrolment.hs_object_id] =
          unitEnrolments;
        totalUnitEnrolments += unitEnrolments.length;

        // Add unit emails to set
        unitEnrolments.forEach((unit) => {
          if (unit.email) allEmails.add(unit.email.toLowerCase());
        });

        // Store units for later workshop fetch
        allUnits.push(...unitEnrolments);

        console.log(
          `Processed ${unitEnrolments.length} unit enrolments for class enrolment ${classEnrolment.student_enrolment_id}`,
        );
      } catch (error) {
        console.error(
          `Error fetching unit enrolments for class enrolment ${classEnrolment.id}:`,
          error.message,
        );
        unitEnrolmentsByClassEnrolment[classEnrolment.hs_object_id] = [];
      }
    });

    await Promise.all(promises);
    if (i + batchSize < classEnrolments.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // --- NEW: Fetch workshop enrolments for each unit ---
  const workshopProperties = [
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
  ];

  const workshopEnrolmentsByUnit = {}; // unitId -> array of workshops

  for (const unit of allUnits) {
    let workshopIds = [];

    // Try associations first (unit -> workshop)
    try {
      const assoc = await axios.get(
        `https://api.hubapi.com/crm/v4/objects/2-56274552/${unit.hs_object_id}/associations/2-56274582`,
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
      // ignore
    }

    // Fallback: property workshop_enrol_id (may contain comma-separated IDs)
    if (workshopIds.length === 0 && unit.workshop_enrol_id) {
      if (unit.workshop_enrol_id.includes(",")) {
        workshopIds = unit.workshop_enrol_id.split(",").map((id) => id.trim());
      } else {
        workshopIds = [unit.workshop_enrol_id];
      }
    }

    if (workshopIds.length > 0) {
      const workshops = await fetchObjectsByIds(
        "2-56274582", // workshop enrolment object type
        workshopIds,
        workshopProperties,
        token,
      );
      workshopEnrolmentsByUnit[unit.hs_object_id] = workshops;

      // Add workshop emails to set
      workshops.forEach((w) => {
        if (w.email) allEmails.add(w.email.toLowerCase());
      });
    } else {
      workshopEnrolmentsByUnit[unit.hs_object_id] = [];
    }

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // --- Contact search for all emails (including workshops) ---
  const emailToContactMap = await searchContactsByEmails(
    Array.from(allEmails),
    token,
  );

  // Attach contact data to class enrolments
  const classEnrolmentsWithContacts = classEnrolments.map((enrolment) => ({
    ...enrolment,
    contact_data: enrolment.email
      ? emailToContactMap[enrolment.email.toLowerCase()] || null
      : null,
  }));

  // Attach contact data to unit enrolments and add workshops
  const unitEnrolmentsWithWorkshopsAndContacts = {};
  Object.keys(unitEnrolmentsByClassEnrolment).forEach((key) => {
    unitEnrolmentsWithWorkshopsAndContacts[key] =
      unitEnrolmentsByClassEnrolment[key].map((unitEnrolment) => {
        const unitContact = unitEnrolment.email
          ? emailToContactMap[unitEnrolment.email.toLowerCase()] || null
          : null;

        // Attach contact data to each workshop of this unit
        const workshopsWithContacts = (
          workshopEnrolmentsByUnit[unitEnrolment.hs_object_id] || []
        ).map((w) => ({
          ...w,
          contact_data: w.email
            ? emailToContactMap[w.email.toLowerCase()] || null
            : null,
        }));

        return {
          ...unitEnrolment,
          contact_data: unitContact,
          workshops: workshopsWithContacts,
        };
      });
  });

  return {
    classEnrolments: classEnrolmentsWithContacts,
    unitEnrolmentsByClassEnrolment: unitEnrolmentsWithWorkshopsAndContacts,
    totalClassEnrolments: classEnrolments.length,
    totalUnitEnrolments: totalUnitEnrolments,
  };
}
