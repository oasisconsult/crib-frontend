"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { useTheme } from "@/contexts/ThemeContext";

interface TableColumn<T> {
  key: keyof T;
  title: string;
  render?: (value: any, item: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  className?: string;
  loading?: boolean;
  empty?: string;
}

export function Table<T>({ data, columns, className = "", loading = false, empty = "No data available" }: TableProps<T>) {
  const { theme } = useTheme();

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-surface-dark rounded-xl" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        {empty}
      </div>
    );
  }

  return (
    <motion.div
      className={cn("w-full text-sm", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <table className="w-full text-sm">
        <thead className={cn("text-muted border-b border-border-" + theme)}>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className={cn("text-left py-3 px-4 font-medium", column.className)}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn("divide-y divide-border-" + theme)}>
          {data.map((item, rowIndex) => (
            <motion.tr
              key={rowIndex}
              className="hover:bg-white/5 transition-colors duration-200"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: rowIndex * 0.05 }}
            >
              {columns.map((column, colIndex) => (
                <td key={colIndex} className={cn("py-3 px-4", column.className)}>
                  {column.render ? column.render(item[column.key], item) : String(item[column.key] || "")}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
