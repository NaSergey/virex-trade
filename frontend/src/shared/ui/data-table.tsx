"use client";

import {
  ColumnDef,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  SortingState,
  OnChangeFn,
} from "@tanstack/react-table";
import React, { useEffect, useRef, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/Table";
import { cn } from "@/shared/lib/utils/css";
import Loader from "@/shared/ui/loader";

export interface IDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  className?: string;
  rowClassName?: string | ((row: TData, index: number) => string);
  headerClassName?: string;
  noDataContent?: React.ReactNode;
  onErrorContent?: React.ReactNode;
  loadingContent?: React.ReactNode;
  isLoading?: boolean;
  manualSorting?: boolean;

  onRowClick?: (row: TData) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;

  /**
   * Содержимое раскрытой строки. Если передано — строки становятся
   * раскрывающимися: клик по строке (при отсутствии onRowClick) переключает
   * её, а колонка с шевроном добавляется вызывающим кодом через
   * `row.getIsExpanded()`. Состояние раскрытия живёт внутри таблицы: наружу
   * оно никому не нужно, а строка сбрасывается вместе с данными.
   */
  renderExpanded?: (row: TData) => React.ReactNode;

  /**
   * Стабильный ключ строки. Без него ключ — индекс, и раскрытая строка
   * «переезжает» на чужую сделку при смене страницы или после рефетча.
   */
  getRowId?: (row: TData, index: number) => string;

  state?: {
    sorting?: SortingState;
  };
  onSortingChange?: OnChangeFn<SortingState>;
}

/** Длительность .row-reveal.closing — держим строку живой, пока она сворачивается. */
const COLLAPSE_MS = 160;

/**
 * Раскрытая строка, анимированная в обе стороны. Размонтирование отложено на
 * время закрывающей анимации — иначе строка просто мгновенно исчезала бы.
 *
 * Содержимое приходит функцией, а не children: свёрнутая строка не должна
 * рендерить вообще ничего, иначе каждая строка таблицы сразу дёрнула бы свой
 * запрос за данными раскрытия.
 */
function ExpandedRow({
  open,
  colSpan,
  render,
}: {
  open: boolean;
  colSpan: number;
  render: () => React.ReactNode;
}) {
  // Подстройка состояния при смене пропа: свернули — включаем фазу закрытия,
  // на время которой строка остаётся в DOM и доигрывает анимацию.
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    setClosing(!open);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  if (!open && !closing) return null;

  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        <div className={cn("row-reveal", !open && "closing")}>
          <div>{render()}</div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  className,
  rowClassName,
  noDataContent,
  onErrorContent,
  headerClassName,
  loadingContent,
  isLoading,
  state,
  manualSorting,

  onSortingChange,
  onRowClick,
  onLoadMore,
  hasMore,
  renderExpanded,
  getRowId,
}: IDataTableProps<TData, TValue>) {
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => !!renderExpanded,
    onExpandedChange: setExpanded,
    onSortingChange,
    state: { ...state, expanded },
    manualSorting,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);

  const shouldStretch =
    isLoading || !!onErrorContent || !table.getRowModel().rows?.length;

  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      {
        root: containerRef.current,
        threshold: 1.0,
      },
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [onLoadMore, hasMore]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full min-w-0 min-h-0 [scrollbar-gutter:stable]",
        shouldStretch &&
          "[&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]>table]:h-full",
        className,
      )}
    >
      <Table>
        <TableHeader className={headerClassName}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "text-xs leading-none line-height-xs text-muted spacing-none font-medium whitespace-nowrap",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <TableRow className="h-full hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="p-0 align-top text-center"
              >
                {loadingContent ?? ""}
              </TableCell>
            </TableRow>
          ) : onErrorContent ? (
            <TableRow className="h-full hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="p-0 align-middle text-center"
              >
                {onErrorContent}
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows?.length ? (
            <>
              {table.getRowModel().rows.map((row, index) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      typeof rowClassName === "function" ? rowClassName(row.original, index) : rowClassName,
                      (onRowClick || row.getCanExpand()) && "cursor-pointer",
                    )}
                    onClick={() => {
                      if (onRowClick) onRowClick(row.original);
                      else if (row.getCanExpand()) row.toggleExpanded();
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="text-xs leading-none line-height-xs spacing-none font-normal"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {renderExpanded && (
                    <ExpandedRow
                      open={row.getIsExpanded()}
                      colSpan={row.getVisibleCells().length}
                      render={() => renderExpanded(row.original)}
                    />
                  )}
                </React.Fragment>
              ))}
              {/*Loader sentinel */}
              {hasMore && (
                <TableRow className="cursor-default hover:bg-transparent">
                  <TableCell colSpan={columns.length}>
                    <div ref={loaderRef}></div>
                    <div className="h-8 w-full text-center text-muted flex items-center justify-center">
                      <Loader />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          ) : (
            <TableRow className="h-full hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="p-0 align-top text-center"
              >
                {noDataContent ?? ""}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

