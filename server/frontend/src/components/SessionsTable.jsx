import { useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { formatDate, formatNumber, formatTokenCompact, formatCost, formatDurationMs } from '../utils/format';

export default function SessionsTable({ sessions }) {
  const [quickFilter, setQuickFilter] = useState('');

  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = new Date(a.started_at || 0);
    const dateB = new Date(b.started_at || 0);
    return dateB - dateA;
  });

  const columnDefs = [
    { field: 'session_id', headerName: 'Session ID', flex: 1, minWidth: 200 },
    { field: 'user_id', headerName: 'User', flex: 0.8, minWidth: 120 },
    {
      field: 'title',
      headerName: 'Title',
      flex: 1,
      minWidth: 150,
      cellRenderer: (props) => props.value || '-',
    },
    {
      field: 'total_tokens',
      headerName: 'Tokens',
      flex: 0.7,
      minWidth: 100,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatTokenCompact(props.value),
    },
    {
      field: 'total_input_tokens',
      headerName: 'Input Tokens',
      flex: 0.8,
      minWidth: 120,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatTokenCompact(props.value),
    },
    {
      field: 'total_output_tokens',
      headerName: 'Output Tokens',
      flex: 0.8,
      minWidth: 120,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatTokenCompact(props.value),
    },
    {
      field: 'total_cached_tokens',
      headerName: 'Cached Tokens',
      flex: 0.8,
      minWidth: 120,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatTokenCompact(props.value),
    },
    {
      field: 'model_turn_count',
      headerName: 'Turns',
      flex: 0.6,
      minWidth: 80,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatNumber(props.value),
    },
    {
      field: 'tool_call_count',
      headerName: 'Tools',
      flex: 0.6,
      minWidth: 80,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatNumber(props.value),
    },
    {
      field: 'total_nano_aiu',
      headerName: 'Cost',
      flex: 0.7,
      minWidth: 90,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatCost(props.value),
    },
    {
      field: 'total_duration_ms',
      headerName: 'Duration',
      flex: 0.9,
      minWidth: 130,
      filter: 'agNumberColumnFilter',
      cellRenderer: (props) => formatDurationMs(props.value),
    },
    {
      field: 'started_at',
      headerName: 'Started',
      flex: 1,
      minWidth: 180,
      cellRenderer: (props) => formatDate(props.value),
    },
    {
      field: 'ended_at',
      headerName: 'Ended',
      flex: 1,
      minWidth: 180,
      cellRenderer: (props) => formatDate(props.value),
    },
  ];

  return (
    <section className="table-wrap">
      <div className="table-toolbar">
        <h2>Sessions</h2>
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
          rowData={sortedSessions}
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

