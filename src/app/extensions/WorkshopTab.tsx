import React, { useEffect, useState } from "react";
import {
  Text,
  Button,
  Flex,
  hubspot,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  StatusTag,
  Card,
  Link,
} from "@hubspot/ui-extensions";

// Replace with your actual object type IDs
const UNIT_ENROLMENT_OBJECT_TYPE_ID = "2-56274552";
const WORKSHOP_ENROLMENT_OBJECT_TYPE_ID = "2-56274582";

// ---------- Type Definitions ----------
interface Contact {
  id: string;
  hs_object_id: string;
  firstname: string;
  lastname: string;
  email: string;
  fullname: string;
}

interface UnitEnrolment {
  hs_object_id: string;
  unit_name?: string;
  code?: string;
  status?: string;
  start_date?: string;
  finish_date?: string;
  amount_paid?: string;
}

interface WorkshopEnrolment {
  hs_object_id: string;
  workshop_name?: string;
  email?: string;
  given_name?: string;
  enrol_id?: string;
  hrwl_outcome?: string;
  status?: string;
  start_date?: string;
  finish_date?: string;
  unit_enrolment?: UnitEnrolment | null;
  contact_data?: Contact | null;
}

interface Workshop {
  hs_object_id: string;
  workshop_name?: string;
  workshop_code?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  location?: string;
  duration?: string;
  qualification?: string;
}

interface ApiResponse {
  status: string;
  workshop: Workshop;
  workshopEnrolments: WorkshopEnrolment[];
  summary: {
    totalWorkshopEnrolments: number;
  };
  message?: string;
}

interface ExtensionProps {
  context: any;
  addAlert: (alert: { type: string; message: string }) => void;
  fetchCrmObjectProperties: (
    properties: string[],
  ) => Promise<Record<string, any>>;
}

// ---------- Component ----------
const Extension: React.FC<ExtensionProps> = ({
  context,
  addAlert,
  fetchCrmObjectProperties,
}) => {
  const [workshopId, setWorkshopId] = useState<string | null>(null);
  const [workshopName, setWorkshopName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string>("");

  const portalId = context.portal.id;

  // Fetch current workshop's properties
  useEffect(() => {
    fetchCrmObjectProperties(["hs_object_id", "workshop_name"]).then(
      (props) => {
        setWorkshopId(props.hs_object_id);
        setWorkshopName(props.workshop_name || "Workshop");
      },
    );
  }, []);

  // Load data when we have the ID
  useEffect(() => {
    if (workshopId) fetchData();
  }, [workshopId]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await hubspot.serverless(
        "fetchWorkshopMainEnrolmentsWithUnits",
        {
          parameters: { workshopId },
        },
      )) as ApiResponse;

      if (result.status === "success") {
        setData(result);
        addAlert({
          type: "success",
          message: `Loaded ${result.workshopEnrolments.length} workshop enrolments`,
        });
      } else {
        setError(result.message || "Failed to fetch data");
        addAlert({
          type: "error",
          message: result.message || "Failed to fetch data",
        });
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
      addAlert({
        type: "error",
        message: err.message || "Failed to fetch data",
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Formatting Helpers ----------
  const formatDate = (date: string) =>
    date
      ? new Date(date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";

  const formatCurrency = (amt: string) =>
    amt ? `$${parseFloat(amt).toFixed(2)}` : "$0";

  const getStatusVariant = (status: string) => {
    const s = (status || "").toLowerCase();
    if (
      s.includes("active") ||
      s.includes("completed") ||
      s.includes("booked") ||
      s.includes("enrolled")
    )
      return "success";
    if (
      s.includes("cancelled") ||
      s.includes("failed") ||
      s.includes("withdrawn")
    )
      return "danger";
    if (s.includes("pending") || s.includes("in progress")) return "warning";
    return "default";
  };

  const renderEmailWithContact = (item: {
    email?: string;
    contact_data?: Contact | null;
  }) => {
    if (!item.email) return <Text variant="microcopy">-</Text>;
    if (item.contact_data) {
      return (
        <Link
          href={`https://app.hubspot.com/contacts/${portalId}/record/0-1/${item.contact_data.hs_object_id}`}
          external={false}
        >
          {item.email}
        </Link>
      );
    }
    return (
      <Flex direction="column" gap="xs">
        <Text>{item.email}</Text>
        <Text
          variant="microcopy"
          format={{ fontSize: "xs", color: "#999", fontStyle: "italic" }}
        >
          No contact
        </Text>
      </Flex>
    );
  };

  // ---------- Render ----------
  return (
    <Flex direction="column" gap="lg">
      {/* Header */}
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: "bold", fontSize: "lg" }}>
          Workshop Enrollments:
        </Text>
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </Flex>

      {error && (
        <Card style={{ backgroundColor: "#fee", padding: 12 }}>
          <Text color="red">{error}</Text>
          <Button onClick={fetchData} size="sm">
            Retry
          </Button>
        </Card>
      )}

      {data && (
        <>
          {/* Workshop Enrolments Table */}
          <Table bordered>
            <TableHead>
              <TableRow>
                <TableHeader>Student Name</TableHeader>
                <TableHeader>Workshop Enrollment</TableHeader>

                <TableHeader>Email</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Start Date</TableHeader>
                <TableHeader>Finish Date</TableHeader>
                <TableHeader>Enrol ID</TableHeader>
                <TableHeader>HRWL Outcome</TableHeader>
                {/* Unit columns */}
                <TableHeader>Unit Name</TableHeader>
                <TableHeader>Unit Code</TableHeader>
                <TableHeader>Unit Status</TableHeader>
                <TableHeader>Unit Start</TableHeader>
                <TableHeader>Unit Finish</TableHeader>
                <TableHeader>Unit Paid</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.workshopEnrolments.map((we) => {
                const unit = we.unit_enrolment;
                return (
                  <TableRow key={we.hs_object_id}>
                    <TableCell width={"min"}>
                      {we.given_name || we.contact_data?.firstname || "—"}
                 
                    </TableCell>
                    <TableCell>
                      <Link
                        href={{
                          url: `https://app.hubspot.com/contacts/${portalId}/record/${WORKSHOP_ENROLMENT_OBJECT_TYPE_ID}/${we.hs_object_id}`,
                          external: true,
                        }}
                      >
                        {we.workshop_name}
                      </Link>
                    </TableCell>
                    <TableCell>{renderEmailWithContact(we)}</TableCell>
                    <TableCell>
                      <StatusTag variant={getStatusVariant(we.status)}>
                        {we.status || "Unknown"}
                      </StatusTag>
                    </TableCell>
                    <TableCell width={"min"}>
                      {formatDate(we.start_date)}
                    </TableCell>
                    <TableCell width={"min"}>
                      {formatDate(we.finish_date)}
                    </TableCell>
                    <TableCell>{we.enrol_id || "—"}</TableCell>
                    <TableCell>{we.hrwl_outcome || "—"}</TableCell>
                    {/* Unit fields */}
                    <TableCell width={"min"}>
                      {unit ? (
                        <Link
                          href={{
                            url: `https://app.hubspot.com/contacts/${portalId}/record/${UNIT_ENROLMENT_OBJECT_TYPE_ID}/${unit.hs_object_id}`,
                            external: true,
                          }}
                        >
                          {unit?.unit_name || "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{unit?.code || "—"}</TableCell>
                    <TableCell>
                      {unit ? (
                        <StatusTag variant={getStatusVariant(unit.status)}>
                          {unit.status || "Unknown"}
                        </StatusTag>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell width={"min"}>
                      {unit ? formatDate(unit.start_date) : "—"}
                    </TableCell>
                    <TableCell width={"min"}>
                      {unit ? formatDate(unit.finish_date) : "—"}
                    </TableCell>
                    <TableCell>
                      {unit ? formatCurrency(unit.amount_paid) : "—"}
                    </TableCell>
                    <TableCell>
                      <Flex gap="xs">
                        <Button
                          href={`https://app.hubspot.com/contacts/${portalId}/record/${WORKSHOP_ENROLMENT_OBJECT_TYPE_ID}/${we.hs_object_id}`}
                          external={false}
                          size="sm"
                          variant="primary"
                        >
                          View Enrolment
                        </Button>
                        {unit && (
                          <Button
                            href={`https://app.hubspot.com/contacts/${portalId}/record/${UNIT_ENROLMENT_OBJECT_TYPE_ID}/${unit.hs_object_id}`}
                            external={false}
                            size="sm"
                            variant="primary"
                          >
                            View Unit
                          </Button>
                        )}
                      </Flex>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </Flex>
  );
};

// Register the extension for the Workshop object
hubspot.extend<"crm.record.tab">(({ context, actions }) => (
  <Extension
    context={context}
    addAlert={actions.addAlert}
    fetchCrmObjectProperties={actions.fetchCrmObjectProperties}
  />
));
