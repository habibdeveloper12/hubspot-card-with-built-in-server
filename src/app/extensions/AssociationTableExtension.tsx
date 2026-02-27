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

// Register the extension for the Class object
hubspot.extend<"crm.record.tab">(({ context, actions }) => (
  <Extension
    context={context}
    addAlert={actions.addAlert}
    fetchCrmObjectProperties={actions.fetchCrmObjectProperties}
  />
));

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

interface WorkshopEnrolment {
  hs_object_id: string;
  workshop_name?: string;
  code?: string;
  email?: string;
  enrol_id?: string;
  hrwl_outcome?: string;
  status?: string;
  start_date?: string;
  finish_date?: string;
  delivery?: string;
  amount_paid?: string;
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
  workshops?: WorkshopEnrolment[]; // attached by backend
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

interface ClassData {
  id: string;
  hs_object_id: string;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  status: string;
  duration: string;
  qualification: string;
  createdate: string;
}

interface HierarchicalData {
  class: ClassData;
  classEnrolments: ClassEnrolment[];
  unitEnrolmentsByClassEnrolment: { [key: string]: UnitEnrolment[] };
  summary: {
    totalClassEnrolments: number;
    totalUnitEnrolments: number;
  };
}

// ---------- Component ----------
const Extension = ({ context, addAlert, fetchCrmObjectProperties }: any) => {
  const [className, setClassName] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedClassEnrolments, setExpandedClassEnrolments] = useState<
    Set<string>
  >(new Set());
  const [hierarchicalData, setHierarchicalData] =
    useState<HierarchicalData | null>(null);
  const [error, setError] = useState("");

  const portalId = context.portal.id;

  // Fetch current class properties
  useEffect(() => {
    fetchCrmObjectProperties(["hs_object_id", "class_name"]).then(
      (properties: { [propertyName: string]: any }) => {
        setClassName(properties.class_name || "Unnamed Class");
        setClassId(properties.hs_object_id);
      },
    );
  }, []);

  // Load data when classId is available
  useEffect(() => {
    if (classId) fetchHierarchicalData();
  }, [classId]);

  const fetchHierarchicalData = async () => {
    if (!classId) return;

    setLoading(true);
    setError("");
    try {
      const result = await hubspot.serverless("fetchCompanies", {
        parameters: { classId },
      });

      if (result.status === "success") {
        const classEnrolmentsWithExpanded = (result.classEnrolments || []).map(
          (enrolment: any) => ({ ...enrolment, expanded: false }),
        );

        setHierarchicalData({
          class: result.class || {
            id: classId,
            hs_object_id: classId,
            name: className || "Unnamed Class",
          },
          classEnrolments: classEnrolmentsWithExpanded,
          unitEnrolmentsByClassEnrolment:
            result.unitEnrolmentsByClassEnrolment || {},
          summary: result.summary || {
            totalClassEnrolments: result.classEnrolments?.length || 0,
            totalUnitEnrolments: result.unitEnrolmentsByClassEnrolment
              ? Object.values(result.unitEnrolmentsByClassEnrolment).flat()
                  .length
              : 0,
          },
        });

        // Count contacts for alert
        let contactsFound = 0;
        if (result.classEnrolments) {
          contactsFound += result.classEnrolments.filter(
            (e: any) => e.contact_data,
          ).length;
        }
        if (result.unitEnrolmentsByClassEnrolment) {
          Object.values(result.unitEnrolmentsByClassEnrolment).forEach(
            (units: any) => {
              contactsFound += units.filter((u: any) => u.contact_data).length;
            },
          );
        }

        addAlert({
          type: "success",
          message: `Loaded ${result.classEnrolments?.length || 0} class enrolments, ${
            result.summary?.totalUnitEnrolments || 0
          } unit enrolments, and found ${contactsFound} contacts`,
        });
      } else {
        setError(result.message || "Failed to fetch data");
        addAlert({
          type: "error",
          message: result.message || "Failed to fetch data",
        });
      }
    } catch (error: any) {
      console.error("Error in fetchHierarchicalData:", error);
      setError(error?.message || "An error occurred");
      addAlert({
        type: "error",
        message: error?.message || "Failed to fetch hierarchical data",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleClassEnrolment = (enrolmentId: string) => {
    const newExpanded = new Set(expandedClassEnrolments);
    if (newExpanded.has(enrolmentId)) newExpanded.delete(enrolmentId);
    else newExpanded.add(enrolmentId);
    setExpandedClassEnrolments(newExpanded);
  };

  // Helper to get the first workshop (if any) for a unit
  const getFirstWorkshop = (
    unit: UnitEnrolment,
  ): WorkshopEnrolment | undefined => {
    return unit.workshops && unit.workshops.length > 0
      ? unit.workshops[0]
      : undefined;
  };

  const formatCurrency = (amount: string) => {
    if (!amount || amount === "0") return "$0";
    try {
      const num = parseFloat(amount);
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    } catch {
      return `$${amount}`;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const getStatusTagVariant = (status: string) => {
    if (!status) return "default";
    const statusLower = status.toLowerCase();
    if (
      statusLower.includes("active") ||
      statusLower.includes("enrolled") ||
      statusLower.includes("completed")
    )
      return "success";
    if (
      statusLower.includes("cancelled") ||
      statusLower.includes("failed") ||
      statusLower.includes("withdrawn")
    )
      return "danger";
    if (statusLower.includes("pending") || statusLower.includes("in progress"))
      return "warning";
    return "info";
  };

  const renderEmailWithContactLink = (item: {
    email?: string;
    contact_data?: Contact | null;
  }) => {
    if (!item.email) return <Text variant="microcopy">-</Text>;
    if (item.contact_data) {
      return (
        <Link
          href={{
            url: `https://app.hubspot.com/contacts/${portalId}/record/0-1/${item.contact_data.hs_object_id}`,
            external: false,
          }}
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
          No contact found
        </Text>
      </Flex>
    );
  };

  return (
    <Flex direction="column" gap="lg">
      {/* Header */}
      <Flex direction="row" justify="between" align="center">
        <Flex direction="column" gap="xs">
          <Text
            variant="microcopy"
            format={{ fontWeight: "bold", fontSize: "lg" }}
          >
            Class: {className}
          </Text>
          <Text variant="microcopy">
            Hierarchical view of class enrolments, unit enrolments, and
            workshops
          </Text>
        </Flex>
        <Button
          onClick={fetchHierarchicalData}
          variant="secondary"
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh Data"}
        </Button>
      </Flex>

      {loading && !hierarchicalData && (
        <Flex justify="center" align="center" gap="sm">
          <Text>Loading hierarchical data and searching for contacts...</Text>
        </Flex>
      )}

      {error && (
        <Card
          style={{
            backgroundColor: "#fee",
            padding: "12px",
            borderRadius: "6px",
          }}
        >
          <Flex direction="column" gap="sm">
            <Text color="red" format={{ fontWeight: "bold" }}>
              Error:
            </Text>
            <Text>{error}</Text>
            <Button onClick={fetchHierarchicalData} variant="primary" size="sm">
              Try Again
            </Button>
          </Flex>
        </Card>
      )}

      {hierarchicalData?.classEnrolments &&
        hierarchicalData.classEnrolments.length > 0 && (
          <Flex direction="column" gap="md">
            <Text format={{ fontWeight: "bold", fontSize: "md" }}>
              Class Enrolments ({hierarchicalData.summary.totalClassEnrolments})
            </Text>

            <Table bordered>
              <TableHead>
                <TableRow>
                  <TableHeader width="max">Student Name</TableHeader>
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
                {hierarchicalData.classEnrolments.map((enrolment) => {
                  const isClassExpanded = expandedClassEnrolments.has(
                    enrolment.hs_object_id,
                  );
                  const unitEnrolments =
                    hierarchicalData.unitEnrolmentsByClassEnrolment[
                      enrolment.hs_object_id
                    ] || [];

                  return (
                    <React.Fragment key={`enrolment-${enrolment.hs_object_id}`}>
                      {/* Class enrolment row */}
                      <TableRow>
                        <TableCell width="min">
                          <Flex direction="row" align="center" gap="sm">
                            <Link
                              href={{
                                url: `https://app.hubspot.com/contacts/${portalId}/record/2-56274502/${enrolment.hs_object_id}`,
                                external: true,
                              }}
                            >
                              {enrolment.preferred_name || enrolment.given_name}{" "}
                              {enrolment.surname}
                            </Link>
                          </Flex>
                        </TableCell>
                        <TableCell>
                          {renderEmailWithContactLink(enrolment)}
                        </TableCell>
                        <TableCell width="max">
                          <StatusTag
                            variant={getStatusTagVariant(enrolment.status)}
                          >
                            {enrolment.status || "Unknown"}
                          </StatusTag>
                        </TableCell>
                        <TableCell width="min">
                          {formatDate(enrolment.start_date)}
                        </TableCell>
                        <TableCell width="min">
                          {formatDate(enrolment.finish_date)}
                        </TableCell>
                        <TableCell width="min">
                          {formatCurrency(enrolment.amount_paid)}
                        </TableCell>
                        <TableCell width="max">
                          {enrolment.student_enrolment_id || "-"}
                        </TableCell>
                        <TableCell>
                          <Flex direction="row" gap="xs">
                            <Button
                              href={{
                                url: `https://app.hubspot.com/contacts/${portalId}/record/2-56274502/${enrolment.hs_object_id}`,
                                external: false,
                              }}
                              variant="primary"
                              size="sm"
                            >
                              View
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                toggleClassEnrolment(enrolment.hs_object_id)
                              }
                            >
                              <Icon
                                name={isClassExpanded ? "upCarat" : "downCarat"}
                                size="small"
                              />
                            </Button>
                          </Flex>
                        </TableCell>
                      </TableRow>

                      {/* Expanded row: Unit Enrolments + Workshop columns */}
                      {isClassExpanded && (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <Flex
                              direction="column"
                              gap="md"
                              style={{ padding: "12px 0" }}
                            >
                              <Text format={{ fontWeight: "bold" }}>
                                Unit Enrolments ({unitEnrolments.length})
                              </Text>
                              {unitEnrolments.length > 0 ? (
                                <Table size="small" bordered>
                                  <TableHead>
                                    <TableRow>
                                      <TableHeader>Unit Name</TableHeader>
                                      <TableHeader>Unit Code</TableHeader>
                                      <TableHeader>Status</TableHeader>
                                      <TableHeader>Start Date</TableHeader>
                                      <TableHeader>Finish Date</TableHeader>
                                      <TableHeader>Enrolment Date</TableHeader>
                                      <TableHeader>Amount Paid</TableHeader>
                                      {/* Workshop columns */}
                                      <TableHeader>Workshop Name</TableHeader>
                                      <TableHeader>Workshop Code</TableHeader>
                                      <TableHeader>Workshop Status</TableHeader>
                                      <TableHeader>Workshop Start</TableHeader>
                                      <TableHeader>Workshop Finish</TableHeader>
                                      <TableHeader>
                                        Workshop Enrol ID
                                      </TableHeader>
                                      <TableHeader>Actions</TableHeader>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {unitEnrolments.map((unitEnrolment) => {
                                      const workshop =
                                        getFirstWorkshop(unitEnrolment);
                                      return (
                                        <TableRow
                                          key={unitEnrolment.hs_object_id}
                                        >
                                          <TableCell width={"min"}>
                                            <Text
                                              format={{ fontWeight: "medium" }}
                                            >
                                              <Link
                                                href={{
                                                  url: `https://app.hubspot.com/contacts/${portalId}/record/2-56274552/${unitEnrolment.hs_object_id}`,
                                                  external: true,
                                                }}
                                              >
                                                {unitEnrolment.unit_name ||
                                                  "Unnamed Unit"}
                                              </Link>
                                            </Text>
                                          </TableCell>
                                          <TableCell>
                                            {unitEnrolment.code || "-"}
                                          </TableCell>
                                          <TableCell>
                                            <StatusTag
                                              variant={getStatusTagVariant(
                                                unitEnrolment.status,
                                              )}
                                            >
                                              {unitEnrolment.status ||
                                                "Unknown"}
                                            </StatusTag>
                                          </TableCell>
                                          <TableCell width="min">
                                            {formatDate(
                                              unitEnrolment.start_date,
                                            )}
                                          </TableCell>
                                          <TableCell width="min">
                                            {formatDate(
                                              unitEnrolment.finish_date,
                                            )}
                                          </TableCell>
                                          <TableCell width="min">
                                            {formatDate(
                                              unitEnrolment.enrolment_date,
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {formatCurrency(
                                              unitEnrolment.amount_paid,
                                            )}
                                          </TableCell>
                                          {/* Workshop fields */}
                                          <TableCell>
                                            {workshop ? (
                                              <Link
                                                href={{
                                                  url: `https://app.hubspot.com/contacts/${portalId}/record/2-56274582/${workshop.hs_object_id}`,
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
                                            {workshop?.code || "—"}
                                          </TableCell>
                                          <TableCell>
                                            {workshop ? (
                                              <StatusTag
                                                variant={getStatusTagVariant(
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
                                                href={{
                                                  url: `https://app.hubspot.com/contacts/${portalId}/record/2-56274552/${unitEnrolment.hs_object_id}`,
                                                  external: false,
                                                }}
                                                variant="primary"
                                                size="sm"
                                              >
                                                View Unit
                                              </Button>
                                              {workshop && (
                                                <Button
                                                  href={{
                                                    url: `https://app.hubspot.com/contacts/${portalId}/record/2-56274582/${workshop.hs_object_id}`,
                                                    external: false,
                                                  }}
                                                  variant="secondary"
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
                                  No unit enrolments for this class enrolment
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
          </Flex>
        )}

      {/* Empty state */}
      {!loading && hierarchicalData?.classEnrolments?.length === 0 && (
        <Card style={{ padding: "24px", textAlign: "center" }}>
          <Text variant="microcopy" format={{ fontStyle: "italic" }}>
            No class enrolments found for this class
          </Text>
        </Card>
      )}
    </Flex>
  );
};
