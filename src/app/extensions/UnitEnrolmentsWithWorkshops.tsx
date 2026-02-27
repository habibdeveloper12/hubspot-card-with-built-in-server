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
  Icon,
  Card,
  Link,
} from "@hubspot/ui-extensions";

// Replace with your actual Workshop Enrolment object type ID
const WORKSHOP_ENROLMENT_OBJECT_TYPE_ID = "2-56274582";

// ---------- Type Definitions ----------
interface Contact {
  id: string;
  hs_object_id: string;
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  createdate: string;
  fullname: string;
}

interface ClassEnrolment {
  id: string;
  hs_object_id: string;
  class_name: string;
  given_name: string;
  surname: string;
  email: string;
  start_date: string;
  finish_date: string;
  status: string;
  hubspot_contact_id: string;
  mobile_phone: string;
  preferred_name: string;
  student_enrolment_id: string;
  amount_paid: string;
  qualification_id: string;
  qualification_code: string;
  delivery_method: string;
  axce_contact_id: string;
  axce_instance_id: string;
  createdate: string;
  contact_data?: Contact | null;
}

interface UnitEnrolment {
  id: string;
  hs_object_id: string;
  unit_name: string;
  code: string;
  given_name: string;
  surname: string;
  email: string;
  start_date: string;
  finish_date: string;
  status: string;
  enrolment_date: string;
  class_id: string;
  class_enrol_id: string;
  enrol_id: string;
  unit_id: string;
  hubspot_contact_id: string;
  mobile_phone: string;
  amount_paid: string;
  delivery: string;
  workshop_enrol_id: string;
  workshop_id: string;
  axce_contact_id: string;
  createdate: string;
  contact_data?: Contact | null;
}

interface WorkshopEnrolment {
  id: string;
  hs_object_id: string;
  workshop_name: string;
  email: string;
  given_name: string;
  enrol_id: string;
  hrwl_outcome: string;
  status: string;
  start_date: string;
  finish_date: string;
  createdate: string;
  contact_data?: Contact | null;
}

interface ApiResponse {
  status: string;
  classEnrolment: ClassEnrolment;
  unitEnrolments: UnitEnrolment[];
  workshopEnrolmentsByUnit: Record<string, WorkshopEnrolment[]>;
  summary: {
    totalUnitEnrolments: number;
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
  const [classEnrolmentId, setClassEnrolmentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string>("");

  const portalId = context.portal.id;

  // Fetch current record's properties
  useEffect(() => {
    fetchCrmObjectProperties([
      "hs_object_id",
      "given_name",
      "surname",
      "axce_contact_id",
      "class_name", // fetch class name as well
    ]).then((props) => {
      setClassEnrolmentId(props.hs_object_id);
      const fullName =
        `${props.given_name || ""} ${props.surname || ""}`.trim();
      setStudentName(fullName || props.axce_contact_id || "Class Enrolment");
      // Optionally store class_name in state if needed elsewhere
    });
  }, []);

  // Load data when we have the ID
  useEffect(() => {
    if (classEnrolmentId) fetchData();
  }, [classEnrolmentId]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await hubspot.serverless(
        "fetchUnitEnrolmentsWithWorkshops",
        {
          parameters: { classEnrolmentId },
        },
      )) as ApiResponse;

      if (result.status === "success") {
        setData(result);
        addAlert({
          type: "success",
          message: `Loaded ${result.unitEnrolments.length} unit enrolments, ${result.summary.totalWorkshopEnrolments} workshop enrolments`,
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
    if (s.includes("active") || s.includes("completed") || s.includes("booked"))
      return "success";
    if (s.includes("cancelled") || s.includes("failed")) return "danger";
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

  // Helper to get the first workshop enrolment (if any) for a unit
  const getWorkshop = (unitId: string): WorkshopEnrolment | undefined => {
    if (!data) return undefined;
    const workshops = data.workshopEnrolmentsByUnit[unitId];
    return workshops && workshops.length > 0 ? workshops[0] : undefined;
  };

  // ---------- Render ----------
  return (
    <Flex direction="column" gap="lg">
      {/* Header */}
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: "bold", fontSize: "lg" }}>
          Unit of Competency Enrollments
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
          {/* Unit Enrolments Table with Workshop columns */}
          <Table bordered>
            <TableHead>
              <TableRow>
                <TableHeader>Unit Name</TableHeader>
                <TableHeader>Unit Code</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Start</TableHeader>
                <TableHeader>Finish</TableHeader>
                <TableHeader>Paid</TableHeader>
                <TableHeader>Class Name</TableHeader>
                {/* Workshop columns */}
                <TableHeader>Workshop Name</TableHeader>
                <TableHeader>HRWL Outcome</TableHeader>
                <TableHeader>Workshop Status</TableHeader>
                <TableHeader>Workshop Start</TableHeader>
                <TableHeader>Workshop Finish</TableHeader>
                <TableHeader>Workshop Enrol ID</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.unitEnrolments.map((unit) => {
                const workshop = getWorkshop(unit.hs_object_id);
                return (
                  <TableRow key={unit.hs_object_id}>
                    {/* Class enrolment field */}

                    {/* Unit fields */}
                    <TableCell width={"min"}>
                      <Link
                        href={{
                          url: `https://app.hubspot.com/contacts/${portalId}/record/2-56274552/${unit.hs_object_id}`,
                          external: true,
                        }}
                      >
                        {unit.unit_name || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{unit.code || "—"}</TableCell>
                    <TableCell>{renderEmailWithContact(unit)}</TableCell>
                    <TableCell>
                      <StatusTag variant={getStatusVariant(unit.status)}>
                        {unit.status || "Unknown"}
                      </StatusTag>
                    </TableCell>
                    <TableCell width={"min"}>
                      {formatDate(unit.start_date)}
                    </TableCell>
                    <TableCell width={"min"}>
                      {formatDate(unit.finish_date)}
                    </TableCell>
                    <TableCell width={"min"}>
                      {formatCurrency(unit.amount_paid)}
                    </TableCell>
                    <TableCell width={"min"}>
                      {data.classEnrolment.class_name || "—"}
                    </TableCell>
                    {/* Workshop fields */}
                    <TableCell width={"min"}>
                      {workshop && (
                        <Link
                          href={{
                            url: `https://app.hubspot.com/contacts/${portalId}/record/${WORKSHOP_ENROLMENT_OBJECT_TYPE_ID}/${workshop.hs_object_id}`,
                            external: true,
                          }}
                        >
                          {workshop?.workshop_name || "—"}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>{workshop?.hrwl_outcome || "—"}</TableCell>
                    <TableCell>
                      {workshop ? (
                        <StatusTag variant={getStatusVariant(workshop.status)}>
                          {workshop.status || "Unknown"}
                        </StatusTag>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell width={"min"}>
                      {workshop ? formatDate(workshop.start_date) : "—"}
                    </TableCell>
                    <TableCell width={"min"}>
                      {workshop ? formatDate(workshop.finish_date) : "—"}
                    </TableCell>
                    <TableCell>{workshop?.enrol_id || "—"}</TableCell>
                    <TableCell>
                      <Flex gap="xs">
                        <Button
                          href={`https://app.hubspot.com/contacts/${portalId}/record/2-56274552/${unit.hs_object_id}`}
                          external={false}
                          size="sm"
                        >
                          View Unit
                        </Button>
                        {workshop && (
                          <Button
                            href={`https://app.hubspot.com/contacts/${portalId}/record/${WORKSHOP_ENROLMENT_OBJECT_TYPE_ID}/${workshop.hs_object_id}`}
                            external={false}
                            size="sm"
                          >
                            View Workshop
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

// Register the extension for the Class Enrolment object
hubspot.extend<"crm.record.tab">(({ context, actions }) => (
  <Extension
    context={context}
    addAlert={actions.addAlert}
    fetchCrmObjectProperties={actions.fetchCrmObjectProperties}
  />
));
