import { supabase } from "./supabase";
import { logActivity } from "./activityLog";

export type TrashRecord = {
  id: string;
  sourceTable: string;
  sourceId: string;
  entityLabel: string;
  recordData: Record<string, unknown>;
  relatedRecords: Array<{
    table: string;
    rows: Record<string, unknown>[];
  }>;
  deletedByName: string;
  deletedByEmail: string;
  deletedAt: string;
  restoredAt: string | null;
  branchId: string | null;
};

type RelatedQuery = {
  table: string;
  column: string;
  value: string | number;
};

type MoveToTrashInput = {
  table: string;
  id: string | number;
  label?: string;
  related?: RelatedQuery[];
};

export async function moveToTrash(input: MoveToTrashInput) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  const { data: profile } = user
    ? await supabase
        .from("user_profiles")
        .select("full_name,email")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const { data: record, error: recordError } = await supabase
    .from(input.table)
    .select("*")
    .eq("id", input.id)
    .single();

  if (recordError) throw recordError;

  const relatedRecords: Array<{
    table: string;
    rows: Record<string, unknown>[];
  }> = [];

  for (const relation of input.related || []) {
    const { data, error } = await supabase
      .from(relation.table)
      .select("*")
      .eq(relation.column, relation.value);

    if (error) throw error;

    relatedRecords.push({
      table: relation.table,
      rows: (data || []) as Record<string, unknown>[],
    });
  }

  const { data: trash, error: trashError } = await supabase
    .from("trash_records")
    .insert({
      source_table: input.table,
      source_id: String(input.id),
      entity_label: input.label || String(input.id),
      record_data: record,
      related_records: relatedRecords,
      deleted_by: user?.id || null,
      deleted_by_name: String(profile?.full_name || user?.email || ""),
      deleted_by_email: String(profile?.email || user?.email || ""),
      branch_id: String((record as Record<string, unknown>).branch_id || "") || null,
    })
    .select("id")
    .single();

  if (trashError) throw trashError;

  await logActivity({
    action: "delete",
    entityType: input.table,
    entityId: input.id,
    entityLabel: input.label || String(input.id),
    pageName: "trash",
    description: "نقل العنصر إلى سلة المحذوفات",
    oldData: record,
    metadata: { trashId: trash.id },
  });

  return trash.id as string;
}

export async function loadTrashRecords(): Promise<TrashRecord[]> {
  const { data, error } = await supabase
    .from("trash_records")
    .select("*")
    .is("permanently_deleted_at", null)
    .order("deleted_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: String(row.id),
    sourceTable: String(row.source_table || ""),
    sourceId: String(row.source_id || ""),
    entityLabel: String(row.entity_label || ""),
    recordData: (row.record_data || {}) as Record<string, unknown>,
    relatedRecords: Array.isArray(row.related_records)
      ? row.related_records
      : [],
    deletedByName: String(row.deleted_by_name || ""),
    deletedByEmail: String(row.deleted_by_email || ""),
    deletedAt: String(row.deleted_at || ""),
    restoredAt: row.restored_at ? String(row.restored_at) : null,
    branchId: row.branch_id ? String(row.branch_id) : null,
  }));
}

export async function restoreTrashRecord(item: TrashRecord) {
  // نرجّع السجل الرئيسي أولًا، وبعده السجلات التابعة.
  const { error: mainError } = await supabase
    .from(item.sourceTable)
    .insert(item.recordData);

  if (mainError) throw mainError;

  for (const relation of item.relatedRecords) {
    if (!relation.rows.length) continue;
    const { error } = await supabase.from(relation.table).insert(relation.rows);
    if (error) throw error;
  }

  const { data: userData } = await supabase.auth.getUser();

  const { error: updateError } = await supabase
    .from("trash_records")
    .update({
      restored_at: new Date().toISOString(),
      restored_by: userData.user?.id || null,
    })
    .eq("id", item.id);

  if (updateError) throw updateError;

  await logActivity({
    action: "restore",
    entityType: item.sourceTable,
    entityId: item.sourceId,
    entityLabel: item.entityLabel,
    pageName: "trash",
    description: "استرجاع العنصر من سلة المحذوفات",
    newData: item.recordData,
  });
}

export async function permanentlyDeleteTrashRecord(item: TrashRecord) {
  const { error } = await supabase
    .from("trash_records")
    .delete()
    .eq("id", item.id);

  if (error) throw error;

  await logActivity({
    action: "permanent_delete",
    entityType: item.sourceTable,
    entityId: item.sourceId,
    entityLabel: item.entityLabel,
    pageName: "trash",
    description: "حذف نهائي من سلة المحذوفات",
  });
}
