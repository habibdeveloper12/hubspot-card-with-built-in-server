const axios = require("axios");

exports.main = async (context = {}) => {
  const { dealId, dealStage } = context.parameters;
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;

  if (!dealId || !dealStage) {
    return {
      status: "error",
      message: "Missing required parameters: dealId or dealStage",
    };
  }

  try {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
      {
        properties: {
          dealstage: dealStage,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    return { status: "success" };
  } catch (err) {
    console.error("Error updating deal:", err.response?.data || err.message);
    return {
      status: "error",
      message:
        err.response?.data?.message || err.message || "Failed to update deal",
    };
  }
};
