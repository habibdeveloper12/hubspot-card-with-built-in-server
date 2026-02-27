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

// ✅ CORRECT OBJECT TYPE IDs
const WORKSHOP_ENROLMENT_OBJECT_TYPE_ID = "2-56274582";
const CLASS_ENROLMENT_OBJECT_TYPE_ID = "2-56274502";
const UNIT_ENROLMENT_OBJECT_TYPE_ID = "2-56274552";
const CLASS_OBJECT_TYPE_ID = "2-56273605";

// ---------- Type Definitions ----------
interface Contact {
  id: string;
  hs_object_id: string;
  email?: string;
  firstname?: string;
  lastname?: string;
}

interface Class {
  hs_object_id: string;
  class_name: string;
  class_start_date?: string;
  class_end_date?: string;
  location?: string;
  status?: string;
  duration?: string;
  qualification?: string;
}

interface WorkshopEnrolment {
  hs_object_id: string;
  workshop_name?: string;
  email?: string;
  enrol_id?: string;
  hrwl_outcome?: string;
  status?: string;
  start_date?: string;
  finish_date?: string;
  contact_data?: Contact | null;
}

interface UnitEnrolment {
  hs_object_id: string;
  unit_name?: string;
  code?: string;
  email?: string;
  start_date?: string;
  finish_date?: string;
  status?: string;
  amount_paid?: string;
  contact_data?: Contact | null;
  workshops: WorkshopEnrolment[];
}

interface ClassEnrolment {
  hs_object_id: string;
  class_name?: string;
  given_name?: string;
  surname?: string;
  preferred_name?: string;
  email?: string;
  start_date?: string;
  finish_date?: string;
  status?: string;
  student_enrolment_id?: string;
  amount_paid?: string;
  contact_data?: Contact | null;
  units: UnitEnrolment[];
  class: Class | null; // attached by backend
}

interface ApiResponse {
  status: string;
  contact: Contact;
  classEnrolments: ClassEnrolment[]; // flat list
  summary: {
    totalClassEnrolments: number;
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
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedClassEnrolments, setExpandedClassEnrolments] = useState<
    Set<string>
  >(new Set());
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string>("");

  const portalId = context.portal.id;

  useEffect(() => {
    fetchCrmObjectProperties([
      "hs_object_id",
      "firstname",
      "lastname",
      "email",
    ]).then((props) => {
      setContactId(props.hs_object_id);
      const fullName =
        `${props.firstname || ""} ${props.lastname || ""}`.trim();
      setContactName(fullName || props.email || "Contact");
    });
  }, []);

  useEffect(() => {
    if (contactId) fetchData();
  }, [contactId]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await hubspot.serverless("fetchContactEnrolments", {
        parameters: { contactId },
      })) as ApiResponse;

      if (result.status === "success") {
        setData(result);
        addAlert({
          type: "success",
          message: `Loaded ${result.summary.totalClassEnrolments} class enrolments, ${result.summary.totalUnitEnrolments} unit enrolments, ${result.summary.totalWorkshopEnrolments} workshop enrolments`,
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

  const toggleClassEnrolment = (enrolmentId: string) => {
    const newSet = new Set(expandedClassEnrolments);
    if (newSet.has(enrolmentId)) newSet.delete(enrolmentId);
    else newSet.add(enrolmentId);
    setExpandedClassEnrolments(newSet);
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

  // Helper to get the first workshop (if multiple)
  const getFirstWorkshop = (
    workshops: WorkshopEnrolment[],
  ): WorkshopEnrolment | undefined =>
    workshops.length > 0 ? workshops[0] : undefined;

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
          Class Enrollments for {contactName}
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
          {/* Class Enrolments Table */}
          <Table bordered>
            <TableHead>
              <TableRow>
                <TableHeader>Class Name</TableHeader>
                <TableHeader>Student Name</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Start Date</TableHeader>
                <TableHeader>Finish Date</TableHeader>
                <TableHeader>Amount Paid</TableHeader>
                <TableHeader>Student ID</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.classEnrolments.map((ce) => {
                const isExpanded = expandedClassEnrolments.has(ce.hs_object_id);
                return (
                  <React.Fragment key={ce.hs_object_id}>
                    <TableRow>
                      {/* Class Name with link (if not unknown) */}
                      <TableCell width={"min"}>
                        {ce.class?.hs_object_id === "unknown" ? (
                          <Text>{ce.class?.class_name || "—"}</Text>
                        ) : (
                          <Link
                            href={`https://app.hubspot.com/contacts/${portalId}/record/${CLASS_OBJECT_TYPE_ID}/${ce.class?.hs_object_id}`}
                            external={false}
                          >
                            {ce.class?.class_name || "—"}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        {ce.preferred_name || ce.given_name} {ce.surname}
                      </TableCell>
                      <TableCell>{renderEmailWithContact(ce)}</TableCell>
                      <TableCell>
                        <StatusTag variant={getStatusVariant(ce.status)}>
                          {ce.status || "Unknown"}
                        </StatusTag>
                      </TableCell>
                      <TableCell width={"min"}>
                        {formatDate(ce.start_date)}
                      </TableCell>
                      <TableCell width={"min"}>
                        {formatDate(ce.finish_date)}
                      </TableCell>
                      <TableCell>{formatCurrency(ce.amount_paid)}</TableCell>
                      <TableCell>{ce.student_enrolment_id || "—"}</TableCell>
                      <TableCell>
                        <Flex gap="xs">
                          <Button
                            href={`https://app.hubspot.com/contacts/${portalId}/record/${CLASS_ENROLMENT_OBJECT_TYPE_ID}/${ce.hs_object_id}`}
                            external={false}
                            size="sm"
                          >
                            View
                          </Button>
                          <Button
                            onClick={() =>
                              toggleClassEnrolment(ce.hs_object_id)
                            }
                            size="sm"
                          >
                            <Icon
                              name={isExpanded ? "upCarat" : "downCarat"}
                              size="small"
                            />
                          </Button>
                        </Flex>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={9} style={{ padding: "12px 24px" }}>
                          <Flex direction="column" gap="md">
                            <Text format={{ fontWeight: "bold" }}>
                              Unit Enrolments ({ce.units.length})
                            </Text>
                            {ce.units.length > 0 ? (
                              <Table size="small" bordered>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Unit Name</TableHeader>
                                    <TableHeader>Code</TableHeader>
                                    <TableHeader>Status</TableHeader>
                                    <TableHeader>Start</TableHeader>
                                    <TableHeader>Finish</TableHeader>
                                    <TableHeader>Paid</TableHeader>
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
                                  {ce.units.map((unit) => {
                                    const workshop = getFirstWorkshop(
                                      unit.workshops,
                                    );
                                    return (
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
                                        <TableCell>
                                          {unit.code || "—"}
                                        </TableCell>
                                        <TableCell>
                                          <StatusTag
                                            variant={getStatusVariant(
                                              unit.status,
                                            )}
                                          >
                                            {unit.status || "Unknown"}
                                          </StatusTag>
                                        </TableCell>
                                        <TableCell width={"min"}>
                                          {formatDate(unit.start_date)}
                                        </TableCell>
                                        <TableCell width={"min"}>
                                          {formatDate(unit.finish_date)}
                                        </TableCell>
                                        <TableCell>
                                          {formatCurrency(unit.amount_paid)}
                                        </TableCell>
                                        {/* Workshop fields */}
                                        <TableCell width={"min"}>
                                          {workshop ? (
                                            <Link
                                              href={{
                                                url: `https://app.hubspot.com/contacts/${portalId}/record/${WORKSHOP_ENROLMENT_OBJECT_TYPE_ID}/${workshop.hs_object_id}`,
                                                external: true,
                                              }}
                                            >
                                              {workshop?.workshop_name || "—"}
                                            </Link>
                                          ) : (
                                            "—"
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {workshop?.hrwl_outcome || "—"}
                                        </TableCell>
                                        <TableCell>
                                          {workshop ? (
                                            <StatusTag
                                              variant={getStatusVariant(
                                                workshop.status,
                                              )}
                                            >
                                              {workshop.status || "Unknown"}
                                            </StatusTag>
                                          ) : (
                                            "—"
                                          )}
                                        </TableCell>
                                        <TableCell width={"min"}>
                                          {workshop
                                            ? formatDate(workshop.start_date)
                                            : "—"}
                                        </TableCell>
                                        <TableCell width={"min"}>
                                          {workshop
                                            ? formatDate(workshop.finish_date)
                                            : "—"}
                                        </TableCell>
                                        <TableCell>
                                          {workshop?.enrol_id || "—"}
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
                            ) : (
                              <Text
                                variant="microcopy"
                                format={{ fontStyle: "italic" }}
                              >
                                No unit enrolments for this class enrolment.
                              </Text>
                            )}
                          </Flex>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </Flex>
  );
};

// Register the extension for the Contact object
hubspot.extend<"crm.record.tab">(({ context, actions }) => (
  <Extension
    context={context}
    addAlert={actions.addAlert}
    fetchCrmObjectProperties={actions.fetchCrmObjectProperties}
  />
));
