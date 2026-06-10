import { useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { formatNumber, formatTokenCompact, formatCredits, formatCost } from '../utils/format';

export default function ModelUsageTable({ modelUsage }) {
  const [quickFilter, setQuickFilter] = useState('');

  if (!modelUsage || modelUsage.length === 0) {
    return null;
  }

  const groupedByModel = {};
  modelUsage.forEach((row) => {
    if (!groupedByModel[row.model]) {
      groupedByModel[row.model] = {
        model: row.model,
        request_count: 0,
        session_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        nano_aiu: 0,
      };
    }
    groupedByModel[row.model].request_count += row.request_count || 0;
    groupedByModel[row.model].session_count += row.session_count || 0;
    groupedByModel[row.model].input_tokens += row.input_tokens || 0;
    groupedByModel[row.model].output_tokens += row.output_tokens || 0;
    groupedByModel[row.model].nano_aiu += row.nano_aiu || 0;
  });

  const aggregatedData = Object.values(groupedByModel).sort((a, b) => b.nano_aiu - a.nano_aiu);

  const columnDefs = [
    { field: 'model', headerName: 'Model', flex: 1, minWidth: 200 },
    {
      field: 'request_count',
      headerName: 'Requests',
      flex: 0.7,
      minWidth: 100,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatNumber(props.value),
    },
    {
      field: 'session_count',
      headerName: 'Sessions',
      flex: 0.7,
      minWidth: 100,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatNumber(props.value),
    },
    {
      field: 'input_tokens',
      headerName: 'Input Tokens',
      flex: 0.8,
      minWidth: 120,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatTokenCompact(props.value),
    },
    {
      field: 'output_tokens',
      headerName: 'Output Tokens',
      flex: 0.8,
      minWidth: 120,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatTokenCompact(props.value),
    },
    {
      colId: 'ai_credits',
      field: 'nano_aiu',
      headerName: 'AI Credits',
      flex: 0.7,
      minWidth: 100,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatCredits(props.value),
    },
    {
      colId: 'cost',
      field: 'nano_aiu',
      headerName: 'Cost',
      flex: 0.7,
      minWidth: 90,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatCost(props.value),
    },
  ];

  return (
    <section className="table-wrap">
      <div className="table-toolbar">
        <h2>Model-Level Usage</h2>
        <input
          type="search"
          className="grid-search"
          placeholder="Search all columns…"
          value={quickFilter}
          onChange={(e) => setQuickFilter(e.target.value)}
        />
      </div>
      <div className="ag-theme-quartz ag-root-wrapper ag-ltr ag-layout-normal grid-host">
        <AgGridReact
          columnDefs={columnDefs}
          rowData={aggregatedData}
          quickFilterText={quickFilter}
          pagination={true}
          paginationPageSize={5}
          paginationPageSizeSelector={[5, 50, 100]}
          domLayout="autoHeight"
          defaultColDef={{
            resizable: true,
            filter: true,
            floatingFilter: true,
          }}
        />
      </div>
    </section>
  );
}

