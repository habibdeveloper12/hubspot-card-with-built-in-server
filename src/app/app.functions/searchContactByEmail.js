const axios = require("axios");

exports.main = async (context = {}) => {
  const { email } = context.parameters;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;
console.log(email);
  if (!email) {
    return {
      status: "error",
      message: "Missing required parameter: email",
    };
  }

  try {
    const result = await searchContactByEmail(email, token);

    return {
      status: "success",
      ...result,
    };
  } catch (error) {
    console.error("Error in fetchDealContacts:", error.message);
    return {
      status: "error",
      message: error.message || "Failed to fetch contacts for deal",
    };
  }
};
const searchContactByEmail = async (context = {}) => {
  console.log(context);
  const email  = context;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;

  if (!email) {
    return {
      status: "error",
      message: "Missing required parameter: email",
    };
  }

  try {
    // Search for contact by email
    const contactResponse = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: email,
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
        limit: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const results = contactResponse.data?.results || [];

    if (results.length > 0) {
      const result = results[0];
      const props = result.properties || {};
      const contact = {
        id: result.id,
        hs_object_id: result.id,
        firstname: props.firstname || "",
        lastname: props.lastname || "",
        email: props.email || "",
        phone: props.phone || "",
        createdate: props.createdate || "",
        fullname:
          `${props.firstname || ""} ${props.lastname || ""}`.trim() ||
          props.email ||
          `Contact ${result.id}`,
      };

      return {
        status: "success",
        contact,
      };
    } else {
      return {
        status: "not_found",
        message: `No contact found with email: ${email}`,
      };
    }
  } catch (error) {
    console.error("Error searching contact by email:", error.message);
    return {
      status: "error",
      message: error.message || "Failed to search contact by email",
    };
  }
};