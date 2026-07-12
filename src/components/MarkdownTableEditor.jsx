import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { parseMarkdownTable, serializeMarkdownTable } from '../utils/tableUtils';
import { Plus, Trash2, AlignLeft, AlignCenter, AlignRight, Check, X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Eraser } from 'lucide-react';

export function MarkdownTableEditor({ initialMarkdown, onCommit, onCancel, style }) {
  const [tableData, setTableData] = useState({ headers: [], alignments: [], rows: [] });
  const [activeCell, setActiveCell] = useState(null); // { row, col }
  const [isDirty, setIsDirty] = useState(false);
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

  // Click outside to commit
  useEffect(() => {
    function handleClickOutside(event) {
      // Allow context menu clicks to pass through without closing
      if (event.target.closest('.editor-context-menu')) return;
      
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        commitChanges();
      }
    }
    
    // Use pointerdown to catch clicks before focus changes
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [commitChanges]);

  const updateHeader = (colIndex, value) => {
    const newHeaders = [...tableData.headers];
    newHeaders[colIndex] = value.replace(/\|/g, ''); // prevent breaking markdown
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
    
    const newRows = tableData.rows.map(row => {
      const newRow = [...row];
      newRow.splice(afterIndex + 1, 0, '');
      return newRow;
    });

    setTableData({ headers: newHeaders, alignments: newAlignments, rows: newRows });
    setIsDirty(true);
  };

  const deleteColumn = (colIndex) => {
    if (tableData.headers.length <= 1) return; // Don't delete last column

    const newHeaders = tableData.headers.filter((_, i) => i !== colIndex);
    const newAlignments = tableData.alignments.filter((_, i) => i !== colIndex);
    const newRows = tableData.rows.map(row => row.filter((_, i) => i !== colIndex));
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
    const newRows = tableData.rows.map(row => row.map(() => ''));
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
      className="markdown-table-editor-overlay" 
      style={{ ...style, zIndex: 999999 }} 
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <div className="table-editor-toolbar">
        <button onClick={() => addRow(tableData.rows.length - 1)} className="action-chip" title="Add Row (Bottom)"><Plus size={12} /><span>Row</span></button>
        <button onClick={() => addColumn(tableData.headers.length - 1)} className="action-chip" title="Add Column (Right)"><Plus size={12} style={{ transform: 'rotate(90deg)' }} /><span>Column</span></button>
        <div className="toolbar-divider" style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 4px' }} />
        <button onClick={clearTable} className="action-chip" title="Clear Data"><Eraser size={12} /><span>Clear</span></button>
        <div style={{ flex: 1 }} />
        <button onClick={commitChanges} className="action-chip" title="Save Table"><Check size={12} /><span>Save</span></button>
        <button onClick={onCancel} className="action-chip" title="Cancel"><X size={12} /><span>Cancel</span></button>
      </div>
      
      <div className="table-editor-grid-container">
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
    </div>,
    document.body
  );
}
