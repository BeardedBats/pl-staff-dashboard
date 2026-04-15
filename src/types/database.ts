/**
 * Placeholder Supabase database types.
 *
 * Later we'll generate real types from the live schema with:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * Until then, every table/view/function resolves to a loose `any` shape so
 * that queries type-check without hand-writing 29 table definitions. Our
 * route handlers cast results explicitly where it matters (e.g. `as string`
 * on UUIDs), so we don't lose type safety at the call site.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      [tableName: string]: {
        Row: AnyRow;
        Insert: AnyRow;
        Update: AnyRow;
        Relationships: [];
      };
    };
    Views: {
      [viewName: string]: { Row: AnyRow; Relationships: [] };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Functions: { [fnName: string]: any };
    Enums: { [enumName: string]: string };
    CompositeTypes: { [typeName: string]: AnyRow };
  };
};

/** Shorthand for reading a row type once we have generated types. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
