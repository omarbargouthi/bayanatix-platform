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

            tables.append({"name": name, "columns": columns, "measures": table_measures, "mExpression": m_expression})

        print(json.dumps({"tables": tables}))
    except Exception as e:
        print(json.dumps({"error": f"Failed to read data model contents: {e}"}))


if __name__ == "__main__":
    main()
