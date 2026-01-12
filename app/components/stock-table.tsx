import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';

interface StockTableProps {
  ticker: string;
  timeframe: string;
  isSyncing?: boolean;
}

interface StockDataRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

// Mock data simulating Google Sheets data
const weeklyData: Record<string, StockDataRow[]> = {
  AAPL: [
    { date: '2025-12-15', open: 195.32, high: 197.85, low: 194.21, close: 196.54, volume: 52341200, change: 1.22, changePercent: 0.62 },
    { date: '2025-12-08', open: 197.12, high: 198.43, low: 195.11, close: 195.32, volume: 48932100, change: -1.80, changePercent: -0.91 },
    { date: '2025-12-01', open: 195.87, high: 199.76, low: 194.32, close: 197.12, volume: 51234800, change: 1.25, changePercent: 0.64 },
    { date: '2025-11-24', open: 193.45, high: 196.21, low: 192.87, close: 195.87, volume: 47621300, change: 2.42, changePercent: 1.25 },
    { date: '2025-11-17', open: 191.23, high: 194.12, low: 190.54, close: 193.45, volume: 49832100, change: 2.22, changePercent: 1.16 },
    { date: '2025-11-10', open: 189.54, high: 191.87, low: 188.76, close: 191.23, volume: 46234100, change: 1.69, changePercent: 0.89 },
    { date: '2025-11-03', open: 187.21, high: 190.43, low: 186.54, close: 189.54, volume: 48821300, change: 2.33, changePercent: 1.24 },
  ],
  GOOGL: [
    { date: '2025-12-15', open: 142.34, high: 144.21, low: 141.87, close: 143.65, volume: 23412300, change: 1.31, changePercent: 0.92 },
    { date: '2025-12-08', open: 143.21, high: 144.87, low: 142.11, close: 142.34, volume: 21934200, change: -0.87, changePercent: -0.61 },
    { date: '2025-12-01', open: 141.76, high: 145.32, low: 140.98, close: 143.21, volume: 24123400, change: 1.45, changePercent: 1.02 },
    { date: '2025-11-24', open: 139.87, high: 142.54, low: 139.21, close: 141.76, volume: 22341200, change: 1.89, changePercent: 1.35 },
    { date: '2025-11-17', open: 138.12, high: 140.43, low: 137.65, close: 139.87, volume: 23821100, change: 1.75, changePercent: 1.27 },
    { date: '2025-11-10', open: 136.54, high: 138.76, low: 135.98, close: 138.12, volume: 22134200, change: 1.58, changePercent: 1.16 },
    { date: '2025-11-03', open: 134.87, high: 137.21, low: 134.32, close: 136.54, volume: 23621300, change: 1.67, changePercent: 1.24 },
  ],
  MSFT: [
    { date: '2025-12-15', open: 412.34, high: 415.87, low: 410.21, close: 414.32, volume: 18234100, change: 1.98, changePercent: 0.48 },
    { date: '2025-12-08', open: 414.87, high: 416.54, low: 412.11, close: 412.34, volume: 17932100, change: -2.53, changePercent: -0.61 },
    { date: '2025-12-01', open: 411.23, high: 417.98, low: 409.87, close: 414.87, volume: 19123400, change: 3.64, changePercent: 0.88 },
    { date: '2025-11-24', open: 408.76, high: 412.43, low: 407.54, close: 411.23, volume: 17621300, change: 2.47, changePercent: 0.61 },
    { date: '2025-11-17', open: 406.12, high: 409.87, low: 405.32, close: 408.76, volume: 18432100, change: 2.64, changePercent: 0.65 },
    { date: '2025-11-10', open: 403.87, high: 406.54, low: 402.98, close: 406.12, volume: 17834200, change: 2.25, changePercent: 0.56 },
    { date: '2025-11-03', open: 401.34, high: 404.76, low: 400.54, close: 403.87, volume: 18321100, change: 2.53, changePercent: 0.63 },
  ],
  AMZN: [
    { date: '2025-12-15', open: 178.23, high: 180.65, low: 177.54, close: 179.87, volume: 34123400, change: 1.64, changePercent: 0.92 },
    { date: '2025-12-08', open: 179.34, high: 180.87, low: 178.11, close: 178.23, volume: 32934200, change: -1.11, changePercent: -0.62 },
    { date: '2025-12-01', open: 177.65, high: 181.43, low: 176.98, close: 179.34, volume: 35123400, change: 1.69, changePercent: 0.95 },
    { date: '2025-11-24', open: 175.43, high: 178.76, low: 174.87, close: 177.65, volume: 33341200, change: 2.22, changePercent: 1.27 },
    { date: '2025-11-17', open: 173.21, high: 176.54, low: 172.65, close: 175.43, volume: 34821100, change: 2.22, changePercent: 1.28 },
    { date: '2025-11-10', open: 171.34, high: 173.87, low: 170.76, close: 173.21, volume: 33234100, change: 1.87, changePercent: 1.09 },
    { date: '2025-11-03', open: 169.12, high: 172.21, low: 168.54, close: 171.34, volume: 34621300, change: 2.22, changePercent: 1.31 },
  ],
  TSLA: [
    { date: '2025-12-15', open: 342.12, high: 348.76, low: 339.87, close: 345.32, volume: 87234100, change: 3.20, changePercent: 0.94 },
    { date: '2025-12-08', open: 345.67, high: 347.98, low: 341.23, close: 342.12, volume: 82934200, change: -3.55, changePercent: -1.03 },
    { date: '2025-12-01', open: 339.87, high: 349.54, low: 337.65, close: 345.67, volume: 91123400, change: 5.80, changePercent: 1.71 },
    { date: '2025-11-24', open: 335.23, high: 341.87, low: 333.54, close: 339.87, volume: 85621300, change: 4.64, changePercent: 1.38 },
    { date: '2025-11-17', open: 331.45, high: 337.21, low: 329.87, close: 335.23, volume: 88432100, change: 3.78, changePercent: 1.14 },
    { date: '2025-11-10', open: 327.98, high: 332.54, low: 326.43, close: 331.45, volume: 84234200, change: 3.47, changePercent: 1.06 },
    { date: '2025-11-03', open: 324.21, high: 329.12, low: 323.21, close: 327.98, volume: 86821100, change: 3.77, changePercent: 1.16 },
  ],
};

const dailyData: Record<string, StockDataRow[]> = {
  AAPL: [
    { date: '2025-12-19', open: 196.21, high: 198.54, low: 195.87, close: 197.32, volume: 45234100, change: 0.78, changePercent: 0.40 },
    { date: '2025-12-18', open: 195.87, high: 197.21, low: 194.98, close: 196.54, volume: 48932100, change: 0.67, changePercent: 0.34 },
    { date: '2025-12-17', open: 196.43, high: 197.65, low: 195.32, close: 195.87, volume: 42134200, change: -0.56, changePercent: -0.29 },
    { date: '2025-12-16', open: 195.76, high: 197.87, low: 195.21, close: 196.43, volume: 46821300, change: 0.67, changePercent: 0.34 },
    { date: '2025-12-15', open: 195.32, high: 196.98, low: 194.65, close: 195.76, volume: 44234100, change: 0.44, changePercent: 0.23 },
  ],
  GOOGL: [
    { date: '2025-12-19', open: 143.87, high: 145.21, low: 143.32, close: 144.65, volume: 19234100, change: 1.00, changePercent: 0.70 },
    { date: '2025-12-18', open: 143.32, high: 144.54, low: 142.87, close: 143.65, volume: 21134200, change: 0.33, changePercent: 0.23 },
    { date: '2025-12-17', open: 143.98, high: 144.87, low: 142.98, close: 143.32, volume: 18821300, change: -0.66, changePercent: -0.46 },
    { date: '2025-12-16', open: 142.87, high: 144.76, low: 142.43, close: 143.98, volume: 20234100, change: 1.11, changePercent: 0.78 },
    { date: '2025-12-15', open: 142.34, high: 143.54, low: 141.98, close: 142.87, volume: 19432100, change: 0.53, changePercent: 0.37 },
  ],
  MSFT: [
    { date: '2025-12-19', open: 414.87, high: 417.32, low: 413.98, close: 415.87, volume: 15234100, change: 1.55, changePercent: 0.37 },
    { date: '2025-12-18', open: 413.98, high: 415.76, low: 413.21, close: 414.32, volume: 16134200, change: 0.34, changePercent: 0.08 },
    { date: '2025-12-17', open: 414.54, high: 415.98, low: 413.43, close: 413.98, volume: 14821300, change: -0.56, changePercent: -0.14 },
    { date: '2025-12-16', open: 413.21, high: 415.87, low: 412.76, close: 414.54, volume: 15734100, change: 1.33, changePercent: 0.32 },
    { date: '2025-12-15', open: 412.34, high: 414.21, low: 411.87, close: 413.21, volume: 15234200, change: 0.87, changePercent: 0.21 },
  ],
  AMZN: [
    { date: '2025-12-19', open: 180.21, high: 181.87, low: 179.65, close: 180.98, volume: 28234100, change: 1.11, changePercent: 0.62 },
    { date: '2025-12-18', open: 179.54, high: 180.76, low: 179.21, close: 179.87, volume: 29134200, change: 0.33, changePercent: 0.18 },
    { date: '2025-12-17', open: 180.12, high: 180.98, low: 179.32, close: 179.54, volume: 27821300, change: -0.58, changePercent: -0.32 },
    { date: '2025-12-16', open: 179.32, high: 181.21, low: 178.87, close: 180.12, volume: 28734100, change: 0.80, changePercent: 0.45 },
    { date: '2025-12-15', open: 178.23, high: 180.32, low: 177.98, close: 179.32, volume: 27234200, change: 1.09, changePercent: 0.61 },
  ],
  TSLA: [
    { date: '2025-12-19', open: 346.21, high: 349.87, low: 344.98, close: 347.65, volume: 72234100, change: 2.33, changePercent: 0.67 },
    { date: '2025-12-18', open: 344.87, high: 347.21, low: 343.54, close: 345.32, volume: 75134200, change: 0.45, changePercent: 0.13 },
    { date: '2025-12-17', open: 345.98, high: 347.65, low: 344.32, close: 344.87, volume: 71821300, change: -1.11, changePercent: -0.32 },
    { date: '2025-12-16', open: 343.54, high: 347.87, low: 342.98, close: 345.98, volume: 73734100, change: 2.44, changePercent: 0.71 },
    { date: '2025-12-15', open: 342.12, high: 345.21, low: 341.43, close: 343.54, volume: 72234200, change: 1.42, changePercent: 0.42 },
  ],
};

export function StockTable({ ticker, timeframe, isSyncing }: StockTableProps) {
  const dataSource = timeframe === 'Weekly' ? weeklyData : dailyData;
  const data = dataSource[ticker] || dataSource.AAPL;

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toFixed(decimals);
  };

  const formatVolume = (num: number) => {
    return num.toLocaleString('en-US');
  };

  const getCellColor = (value: number) => {
    if (value > 0) return 'text-green-700';
    if (value < 0) return 'text-red-700';
    return 'text-neutral-900';
  };

  if (isSyncing) {
    return (
      <div className="p-6">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md">
      <Table>
        <TableHeader>
          <TableRow className="bg-neutral-50 hover:bg-neutral-50">
            <TableHead className="text-neutral-900">Date</TableHead>
            <TableHead className="text-right text-neutral-900">Open</TableHead>
            <TableHead className="text-right text-neutral-900">High</TableHead>
            <TableHead className="text-right text-neutral-900">Low</TableHead>
            <TableHead className="text-right text-neutral-900">Close</TableHead>
            <TableHead className="text-right text-neutral-900">Volume</TableHead>
            <TableHead className="text-right text-neutral-900">Change</TableHead>
            <TableHead className="text-right text-neutral-900">Change %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => (
            <TableRow key={index} className="hover:bg-neutral-50">
              <TableCell className="text-neutral-900">{row.date}</TableCell>
              <TableCell className="text-right text-neutral-900">{formatNumber(row.open)}</TableCell>
              <TableCell className="text-right text-neutral-900">{formatNumber(row.high)}</TableCell>
              <TableCell className="text-right text-neutral-900">{formatNumber(row.low)}</TableCell>
              <TableCell className="text-right text-neutral-900">{formatNumber(row.close)}</TableCell>
              <TableCell className="text-right text-neutral-900">{formatVolume(row.volume)}</TableCell>
              <TableCell className={`text-right ${getCellColor(row.change)}`}>
                {row.change > 0 ? '+' : ''}{formatNumber(row.change)}
              </TableCell>
              <TableCell className={`text-right ${getCellColor(row.changePercent)}`}>
                {row.changePercent > 0 ? '+' : ''}{formatNumber(row.changePercent)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}