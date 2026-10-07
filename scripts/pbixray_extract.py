#!/usr/bin/env python3
# Reads a .pbix's compiled data model (DAX measures, real column schema, Power
# Query M source per table) via pbixray, since that's the only part of a .pbix
# where measures/full columns live (they aren't in the DataMashup stream that
# lib/lineage/pbix-parser.ts parses directly). Prints one JSON object to stdout;
# never raises past main() so the Node caller always gets JSON, even on failure.
import json
import re
import sys

AUTO_TABLE_RE = re.compile(r"^(LocalDateTable_|DateTableTemplate_)", re.IGNORECASE)


def calculated_tables(model, measures, already):
    """DAX calculated tables (Table = SUMMARIZE(...), FILTER(...), ...).

    pbixray's own table / schema listing only covers imported and calculated *columns*
    (Column.Type 1 and 2); the columns of a calculated table are Type 4, so such tables
    never appear in model.tables. Their definition is in model.dax_tables and their
    columns are read here straight from the model's metadata database.
    """
    out = []
    try:
        dax_tables = model.dax_tables
    except Exception:
        return out
    wanted = [str(r["TableName"]) for _, r in dax_tables.iterrows()
              if not AUTO_TABLE_RE.match(str(r["TableName"])) and str(r["TableName"]) not in already]
    if not wanted:
        return out

    columns_by_table = {}
    try:
        from pbixray.meta.sqlite_handler import SQLiteHandler
        from pbixray.utils import AMO_PANDAS_TYPE_MAPPING, get_data_slice
        handler = SQLiteHandler(get_data_slice(model._metadata_handler._data_model, "metadata.sqlitedb"))
        rows = handler.execute_query(
            "SELECT t.Name AS TableName, COALESCE(c.ExplicitName, c.InferredName) AS ColumnName, "
            "COALESCE(NULLIF(c.ExplicitDataType, 1), c.InferredDataType) AS DataType "
            "FROM Column c JOIN [Table] t ON c.TableId = t.ID WHERE c.Type = 4 ORDER BY t.Name, c.ID"
        )
        for _, r in rows.iterrows():
            if r["ColumnName"] is None:
                continue
            columns_by_table.setdefault(str(r["TableName"]), []).append(
                {"name": str(r["ColumnName"]), "dataType": str(AMO_PANDAS_TYPE_MAPPING.get(r["DataType"], "object"))}
            )
    except Exception:
        pass  # the table is still cataloged, from its definition and measures, without columns

    for _, r in dax_tables.iterrows():
        name = str(r["TableName"])
        if name not in wanted:
            continue
        table_measures = []
        if measures is not None:
            for _, mr in measures[measures["TableName"] == name].iterrows():
                table_measures.append({"name": str(mr["Name"]), "expression": str(mr["Expression"])})
        out.append({"name": name, "columns": columns_by_table.get(name, []), "measures": table_measures,
                    "mExpression": None, "daxExpression": str(r["Expression"])})
    return out


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: pbixray_extract.py <path-to-pbix>"}))
        return

    try:
        from pbixray import PBIXRay
    except ImportError as e:
        print(json.dumps({"error": f"pbixray not installed: {e}"}))
        return

    try:
        model = PBIXRay(sys.argv[1])
    except Exception as e:
        print(json.dumps({"error": f"Failed to open .pbix data model: {e}"}))
        return

    try:
        schema = model.schema
        try:
            power_query = model.power_query
        except Exception:
            power_query = None
        try:
            measures = model.dax_measures
        except Exception:
            measures = None

        tables = []
        for name in model.tables:
            if AUTO_TABLE_RE.match(name):
                continue  # Power BI's own auto-generated hidden date tables — not a real catalog asset

            columns = [
                {"name": str(r["ColumnName"]), "dataType": str(r["PandasDataType"])}
                for _, r in schema[schema["TableName"] == name].iterrows()
            ]

            table_measures = []
            if measures is not None:
                for _, r in measures[measures["TableName"] == name].iterrows():
                    table_measures.append({"name": str(r["Name"]), "expression": str(r["Expression"])})

            m_expression = None
            if power_query is not None:
                rows = power_query[power_query["TableName"] == name]
                if len(rows) > 0:
                    m_expression = str(rows.iloc[0]["Expression"])

            tables.append({"name": name, "columns": columns, "measures": table_measures, "mExpression": m_expression, "daxExpression": None})

        tables.extend(calculated_tables(model, measures, {t["name"] for t in tables}))

        print(json.dumps({"tables": tables}))
    except Exception as e:
        print(json.dumps({"error": f"Failed to read data model contents: {e}"}))


if __name__ == "__main__":
    main()
