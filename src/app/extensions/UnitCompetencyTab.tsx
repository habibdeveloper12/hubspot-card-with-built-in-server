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

const WORKSHOP_ENROLMENT_OBJECT_TYPE_ID = "2-56274582";

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
  hs_object_id: string;
  unit_name?: string;
  code?: string;
}

interface ApiResponse {
  status: string;
  unitEnrolment: UnitEnrolment;
  workshops: WorkshopEnrolment[];
  summary: {
    totalWorkshops: number;
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
  const [unitEnrolmentId, setUnitEnrolmentId] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string>("");

  const portalId = context.portal.id;

  useEffect(() => {
    fetchCrmObjectProperties(["hs_object_id", "unit_name", "code"]).then(
      (props) => {
        setUnitEnrolmentId(props.hs_object_id);
        setUnitName(props.unit_name || "Unnamed Unit");
      },
    );
  }, []);

  useEffect(() => {
    if (unitEnrolmentId) fetchData();
  }, [unitEnrolmentId]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const result = (await hubspot.serverless("fetchUnitWorkshops", {
        parameters: { unitEnrolmentId },
      })) as ApiResponse;

      if (result.status === "success") {
        setData(result);
        addAlert({
          type: "success",
          message: `Loaded ${result.workshops.length} workshop enrolments`,
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
          Unit: {unitName} ({data?.unitEnrolment.code || "—"})
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
            Workshop Enrolments ({data.workshops.length})
          </Text>

          {data.workshops.length > 0 ? (
            <Table bordered>
              <TableHead>
                <TableRow>
                  <TableHeader>Workshop Name</TableHeader>
                  <TableHeader>Workshop Code</TableHeader>
                  <TableHeader>Email</TableHeader>
                  <TableHeader>HRWL Outcome</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Start Date</TableHeader>
                  <TableHeader>Finish Date</TableHeader>
                  <TableHeader>Enrol ID</TableHeader>
                  <TableHeader>Delivery</TableHeader>
                  <TableHeader>Amount Paid</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.workshops.map((w) => (
                  <TableRow key={w.hs_object_id}>
                    <TableCell>
                      <Link
                        href={{
                          url: `https://app.hubspot.com/contacts/${portalId}/record/${WORKSHOP_ENROLMENT_OBJECT_TYPE_ID}/${w.hs_object_id}`,
                          external: true,
                        }}
                      >
                        {w.workshop_name || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{w.code || "—"}</TableCell>
                    <TableCell>{renderEmailWithContact(w)}</TableCell>
                    <TableCell>{w.hrwl_outcome || "—"}</TableCell>
                    <TableCell width={"min"}>
                      <StatusTag variant={getStatusVariant(w.status)}>
                        {w.status || "Unknown"}
                      </StatusTag>
                    </TableCell>
                    <TableCell width={"min"}>
                      {formatDate(w.start_date)}
                    </TableCell>
                    <TableCell width={"min"}>
                      {formatDate(w.finish_date)}
                    </TableCell>
                    <TableCell>{w.enrol_id || "—"}</TableCell>
                    <TableCell width={"min"}>{w.delivery || "—"}</TableCell>
                    <TableCell>{formatCurrency(w.amount_paid)}</TableCell>
                    <TableCell>
                      <Button
                        href={`https://app.hubspot.com/contacts/${portalId}/record/${WORKSHOP_ENROLMENT_OBJECT_TYPE_ID}/${w.hs_object_id}`}
                        external={false}
                        size="sm"
                        variant="primary"
                      >
                        View Workshop Enrollment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Card style={{ padding: 24, textAlign: "center" }}>
              <Text>No workshop enrolments found for this unit.</Text>
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
