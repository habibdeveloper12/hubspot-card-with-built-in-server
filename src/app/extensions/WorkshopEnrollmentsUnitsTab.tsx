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

const UNIT_ENROLMENT_OBJECT_TYPE_ID = "2-56274552";
const CLASS_ENROLMENT_OBJECT_TYPE_ID = "2-56274502";
const CLASS_OBJECT_TYPE_ID = "2-56273605";

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
  hs_object_id: string;
  class_name?: string;
  given_name?: string;
  surname?: string;
  email?: string;
  start_date?: string;
  finish_date?: string;
  status?: string;
  student_enrolment_id?: string;
  amount_paid?: string;
  contact_data?: Contact | null;
}

interface Class {
  hs_object_id: string;
  class_name?: string;
  class_start_date?: string;
  class_end_date?: string;
  location?: string;
  status?: string;
  qualification?: string;
}

interface UnitEnrolment {
  hs_object_id: string;
  unit_name?: string;
  code?: string;
  email?: string;
  given_name?: string;
  surname?: string;
  status?: string;
  start_date?: string;
  finish_date?: string;
  amount_paid?: string;
  contact_data?: Contact | null;
  class_enrolment?: ClassEnrolment | null;
  class?: Class | null;
}

interface WorkshopEnrolment {
  hs_object_id: string;
  workshop_name?: string;
  code?: string;
  email?: string;
  status?: string;
}

interface ApiResponse {
  status: string;
  workshopEnrolment: WorkshopEnrolment;
  units: UnitEnrolment[];
  summary: {
    totalUnits: number;
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

const Extension: React.FC<ExtensionProps> = ({
  context,
  addAlert,
  fetchCrmObjectProperties,
}) => {
  const [workshopEnrolmentId, setWorkshopEnrolmentId] = useState<string | null>(
    null,
  );
  const [workshopName, setWorkshopName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string>("");

  const portalId = context.portal.id;

  useEffect(() => {
    fetchCrmObjectProperties(["hs_object_id", "workshop_name", "code"]).then(
      (props) => {
        setWorkshopEnrolmentId(props.hs_object_id);
        setWorkshopName(props.workshop_name || "Unnamed Workshop");
      },
    );
  }, []);

  useEffect(() => {
    if (workshopEnrolmentId) fetchData();
  }, [workshopEnrolmentId]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await hubspot.serverless("fetchWorkshopEnrollments", {
        parameters: { workshopEnrolmentId },
      })) as ApiResponse;

      if (result.status === "success") {
        setData(result);
        addAlert({
          type: "success",
          message: `Loaded ${result.units.length} unit enrolments`,
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

  return (
    <Flex direction="column" gap="lg">
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: "bold", fontSize: "lg" }}>
          Workshop Enrollments: {workshopName} (
          {data?.workshopEnrolment.code || "—"})
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
          <Text format={{ fontWeight: "bold" }}>
            Unit of Competency Enrollments ({data.units.length})
          </Text>

          {data.units.length > 0 ? (
            <Table bordered>
              <TableHead>
                <TableRow>
                  <TableHeader>Unit Name</TableHeader>
                  <TableHeader>Unit Code</TableHeader>
                  <TableHeader>Email</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Start Date</TableHeader>
                  <TableHeader>Finish Date</TableHeader>
                  <TableHeader>Amount Paid</TableHeader>
                  {/* Class Enrolment columns */}
                  <TableHeader>Class Enrolment (Student)</TableHeader>
              
                  <TableHeader>Class Enrolment Status</TableHeader>
                  <TableHeader>Class Enrolment ID</TableHeader>
                  {/* Class columns (optional) */}
                  <TableHeader>Class Name</TableHeader>
                  <TableHeader>Class Status</TableHeader>
                  <TableHeader>Class Dates</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.units.map((unit) => (
                  <TableRow key={unit.hs_object_id}>
                    <TableCell width={"min"}>
                      <Link
                        href={{
                          url: `https://app.hubspot.com/contacts/${portalId}/record/${UNIT_ENROLMENT_OBJECT_TYPE_ID}/${unit.hs_object_id}`,
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
                    <TableCell>{formatCurrency(unit.amount_paid)}</TableCell>
                    {/* Class Enrolment */}
                    <TableCell>
                      {unit.class_enrolment
                        ? `${unit.class_enrolment.given_name || ""} ${unit.class_enrolment.surname || ""}`.trim() ||
                          "—"
                        : "—"}
                    </TableCell>
                    {/* <TableCell>
                      {unit.class_enrolment
                        ? renderEmailWithContact(unit.class_enrolment)
                        : "—"}
                    </TableCell> */}
                    <TableCell>
                      {unit.class_enrolment ? (
                        <StatusTag
                          variant={getStatusVariant(
                            unit.class_enrolment.status,
                          )}
                        >
                          {unit.class_enrolment.status || "Unknown"}
                        </StatusTag>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {unit.class_enrolment && (
                        <Link
                          href={{
                            url: `https://app.hubspot.com/contacts/${portalId}/record/${CLASS_ENROLMENT_OBJECT_TYPE_ID}/${unit.class_enrolment.hs_object_id}`,
                            external: true,
                          }}
                        >
                          {unit.class_enrolment?.student_enrolment_id || "—"}
                        </Link>
                      )}{" "}
                    </TableCell>
                    {/* Class */}
                    <TableCell width={"min"}>{unit.class?.class_name || "—"}</TableCell>
                    <TableCell>
                      {unit.class ? (
                        <StatusTag
                          variant={getStatusVariant(unit.class.status)}
                        >
                          {unit.class.status || "Unknown"}
                        </StatusTag>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell width={"min"}>
                      {unit.class?.class_start_date &&
                      unit.class?.class_end_date
                        ? `${formatDate(unit.class.class_start_date)} – ${formatDate(unit.class.class_end_date)}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Flex gap="xs">
                        <Button
                          href={`https://app.hubspot.com/contacts/${portalId}/record/${UNIT_ENROLMENT_OBJECT_TYPE_ID}/${unit.hs_object_id}`}
                          external={false}
                          size="sm"
                        >
                          View Unit
                        </Button>
                        {unit.class_enrolment && (
                          <Button
                            href={`https://app.hubspot.com/contacts/${portalId}/record/${CLASS_ENROLMENT_OBJECT_TYPE_ID}/${unit.class_enrolment.hs_object_id}`}
                            external={false}
                            size="sm"
                          >
                            View Class Enrolment
                          </Button>
                        )}
                        {unit.class && (
                          <Button
                            href={`https://app.hubspot.com/contacts/${portalId}/record/${CLASS_OBJECT_TYPE_ID}/${unit.class.hs_object_id}`}
                            external={false}
                            size="sm"
                          >
                            View Class
                          </Button>
                        )}
                      </Flex>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Card style={{ padding: 24, textAlign: "center" }}>
              <Text>No unit enrolments found for this workshop.</Text>
            </Card>
          )}
        </>
      )}
    </Flex>
  );
};

hubspot.extend<"crm.record.tab">(({ context, actions }) => (
  <Extension
    context={context}
    addAlert={actions.addAlert}
    fetchCrmObjectProperties={actions.fetchCrmObjectProperties}
  />
));
