import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { parseMarkdownTable, serializeMarkdownTable } from '../utils/tableUtils';
import {
  Plus,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Eraser,
  Maximize2,
  Minimize2,
  Table2,
} from 'lucide-react';
import AppButton from './AppButton';

export function MarkdownTableEditor({ initialMarkdown, onCommit, onCancel }) {
  const [tableData, setTableData] = useState({ headers: [], alignments: [], rows: [] });
  const [activeCell, setActiveCell] = useState(null); // { row, col }
  const [isDirty, setIsDirty] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const containerRef = useRef(null);

  const handleActionPointerDown = (event, action) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  useEffect(() => {
    setTableData(parseMarkdownTable(initialMarkdown));
    setIsDirty(false);
  }, [initialMarkdown]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    const preventBackgroundScroll = (event) => {
      if (containerRef.current && containerRef.current.contains(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener('wheel', preventBackgroundScroll, { passive: false });
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false });

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.removeEventListener('wheel', preventBackgroundScroll);
      document.removeEventListener('touchmove', preventBackgroundScroll);
    };
  }, []);

  const commitChanges = useCallback(() => {
    if (!isDirty) {
      onCancel();
      return;
    }

    const newMarkdown = serializeMarkdownTable(tableData, { originalMarkdown: initialMarkdown });
    onCommit(newMarkdown);
  }, [initialMarkdown, isDirty, onCancel, onCommit, tableData]);

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      commitChanges();
    }
  };

  const updateHeader = (colIndex, value) => {
    const newHeaders = [...tableData.headers];
    newHeaders[colIndex] = value.replace(/\|/g, '');
    setTableData({ ...tableData, headers: newHeaders });
    setIsDirty(true);
  };

  const updateCell = (rowIndex, colIndex, value) => {
    const newRows = [...tableData.rows];
    newRows[rowIndex][colIndex] = value.replace(/\|/g, '');
    setTableData({ ...tableData, rows: newRows });
    setIsDirty(true);
  };

  const updateAlignment = (colIndex, align) => {
    const newAlignments = [...tableData.alignments];
    newAlignments[colIndex] = align;
    setTableData({ ...tableData, alignments: newAlignments });
    setIsDirty(true);
  };

  const addColumn = (afterIndex) => {
    const newHeaders = [...tableData.headers];
    newHeaders.splice(afterIndex + 1, 0, 'New Column');

    const newAlignments = [...tableData.alignments];
    newAlignments.splice(afterIndex + 1, 0, '');

    const newRows = tableData.rows.map((row) => {
      const newRow = [...row];
      newRow.splice(afterIndex + 1, 0, '');
      return newRow;
    });

    setTableData({ headers: newHeaders, alignments: newAlignments, rows: newRows });
    setIsDirty(true);
  };

  const deleteColumn = (colIndex) => {
    if (tableData.headers.length <= 1) return;

    const newHeaders = tableData.headers.filter((_, i) => i !== colIndex);
    const newAlignments = tableData.alignments.filter((_, i) => i !== colIndex);
    const newRows = tableData.rows.map((row) => row.filter((_, i) => i !== colIndex));
    const fallbackCol = activeCell?.col ?? colIndex;
    const nextCol = Math.max(0, Math.min(newHeaders.length - 1, fallbackCol > colIndex ? fallbackCol - 1 : fallbackCol));

    setTableData({ headers: newHeaders, alignments: newAlignments, rows: newRows });
    if (activeCell?.row === -1) {
      setActiveCell({ row: -1, col: nextCol });
    } else if (typeof activeCell?.row === "number" && activeCell.row >= 0 && newRows.length > 0) {
      const nextRow = Math.min(activeCell.row, newRows.length - 1);
      setActiveCell({ row: nextRow, col: nextCol });
    }
    setIsDirty(true);
  };

  const addRow = (afterIndex) => {
    const newRows = [...tableData.rows];
    const emptyRow = Array(tableData.headers.length).fill('');
    newRows.splice(afterIndex + 1, 0, emptyRow);
    setTableData({ ...tableData, rows: newRows });
    setIsDirty(true);
  };

  const deleteRow = (rowIndex) => {
    const newRows = tableData.rows.filter((_, i) => i !== rowIndex);
    const fallbackCol = Math.max(0, activeCell?.col ?? 0);
    const nextCol = Math.min(fallbackCol, Math.max(0, tableData.headers.length - 1));
    const nextRow = Math.max(0, Math.min(rowIndex, newRows.length - 1));

    setTableData({ ...tableData, rows: newRows });
    if (newRows.length > 0) {
      setActiveCell({ row: nextRow, col: nextCol });
    } else {
      setActiveCell({ row: -1, col: nextCol });
    }
    setIsDirty(true);
  };

  const clearTable = () => {
    const newRows = tableData.rows.map((row) => row.map(() => ''));
    const newHeaders = tableData.headers.map(() => '');
    setTableData({ headers: newHeaders, alignments: tableData.alignments, rows: newRows });
    setIsDirty(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      commitChanges();
    }
  };

  if (!tableData.headers.length) return null;

  return createPortal(
    <div
      className="table-editor-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMaximized ? '0' : '20px',
      }}
    >
      <div
        className={`markdown-table-editor-modal ${isMaximized ? 'maximized' : ''}`}
        ref={containerRef}
        style={{
          width: isMaximized ? '100vw' : 'min(90vw, 960px)',
          height: isMaximized ? '100vh' : 'min(85vh, 720px)',
          borderRadius: isMaximized ? '0' : 'var(--radius-xl, 12px)',
          background: 'var(--surface-bg, #ffffff)',
          border: '1px solid var(--border-soft, rgba(0,0,0,0.1))',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          className="table-editor-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color, #e1e4e8)',
            background: 'var(--surface-muted, #f6f8fa)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px' }}>
            <Table2 size={18} />
            <span>Table Editor</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
              ({tableData.headers.length} cols × {tableData.rows.length} rows)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AppButton
              variant="small"
              iconOnly
              title={isMaximized ? 'Restore size' : 'Maximize'}
              onClick={() => setIsMaximized(!isMaximized)}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </AppButton>
            <AppButton
              variant="small"
              iconOnly
              title="Close"
              onClick={onCancel}
            >
              <X size={14} />
            </AppButton>
          </div>
        </div>

        <div className="table-editor-grid-container" style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <table className="table-editor-grid">
            <thead>
              <tr>
                {tableData.headers.map((header, colIndex) => (
                  <th key={`th-${colIndex}`}>
                    <div className="cell-container">
                      <input
                        type="text"
                        value={header}
                        onChange={(e) => updateHeader(colIndex, e.target.value)}
                        onFocus={() => setActiveCell({ row: -1, col: colIndex })}
                      />
                      {activeCell?.row === -1 && activeCell?.col === colIndex && (
                        <div className="cell-actions top-actions">
                          <button onPointerDown={(e) => handleActionPointerDown(e, () => updateAlignment(colIndex, 'l'))} className={tableData.alignments[colIndex] === 'l' ? 'active' : ''} title="Align Left"><AlignLeft size={14} /></button>
                          <button onPointerDown={(e) => handleActionPointerDown(e, () => updateAlignment(colIndex, 'c'))} className={tableData.alignments[colIndex] === 'c' ? 'active' : ''} title="Align Center"><AlignCenter size={14} /></button>
                          <button onPointerDown={(e) => handleActionPointerDown(e, () => updateAlignment(colIndex, 'r'))} className={tableData.alignments[colIndex] === 'r' ? 'active' : ''} title="Align Right"><AlignRight size={14} /></button>
                          <div className="toolbar-divider" style={{ width: 1, height: 12, background: 'var(--border-color)', margin: '0 2px' }} />
                          <button onPointerDown={(e) => handleActionPointerDown(e, () => addColumn(colIndex - 1))} className="action-chip" title="Insert Column Left"><ArrowLeft size={12} /><span>Left</span></button>
                          <button onPointerDown={(e) => handleActionPointerDown(e, () => addColumn(colIndex))} className="action-chip" title="Insert Column Right"><ArrowRight size={12} /><span>Right</span></button>
                          <button onPointerDown={(e) => handleActionPointerDown(e, () => deleteColumn(colIndex))} className="action-chip danger-text" title="Delete Column"><Trash2 size={12} /><span>Delete</span></button>
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`}>
                  {row.map((cell, colIndex) => (
                    <td key={`td-${rowIndex}-${colIndex}`}>
                      <div className="cell-container">
                        <input
                          type="text"
                          value={cell}
                          onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                          onFocus={() => setActiveCell({ row: rowIndex, col: colIndex })}
                        />
                        {activeCell?.row === rowIndex && activeCell?.col === colIndex && (
                          <div className="cell-actions right-actions">
                            <button onPointerDown={(e) => handleActionPointerDown(e, () => addRow(rowIndex - 1))} className="action-chip" title="Insert Row Above"><ArrowUp size={12} /><span>Above</span></button>
                            <button onPointerDown={(e) => handleActionPointerDown(e, () => addRow(rowIndex))} className="action-chip" title="Insert Row Below"><ArrowDown size={12} /><span>Below</span></button>
                            <button onPointerDown={(e) => handleActionPointerDown(e, () => deleteRow(rowIndex))} className="action-chip danger-text" title="Delete Row"><Trash2 size={12} /><span>Delete</span></button>
                          </div>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="table-editor-toolbar"
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color, #e1e4e8)',
            background: 'var(--surface-muted, #f6f8fa)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AppButton variant="small" title="Add Row (Bottom)" onClick={() => addRow(tableData.rows.length - 1)}>
            <Plus size={14} />
            <span>Row</span>
          </AppButton>
          <AppButton variant="small" title="Add Column (Right)" onClick={() => addColumn(tableData.headers.length - 1)}>
            <Plus size={14} style={{ transform: 'rotate(90deg)' }} />
            <span>Column</span>
          </AppButton>
          <div className="toolbar-divider" style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 4px' }} />
          <AppButton variant="small" danger title="Clear Data" onClick={clearTable}>
            <Eraser size={14} />
            <span>Clear</span>
          </AppButton>
          <div style={{ flex: 1 }} />
          <AppButton variant="small" title="Cancel (Esc)" onClick={onCancel}>
            <X size={14} />
            <span>Cancel</span>
          </AppButton>
          <AppButton variant="primary" title="Save Table (Ctrl+Enter)" onClick={commitChanges}>
            <Check size={14} />
            <span>Save Table</span>
          </AppButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
