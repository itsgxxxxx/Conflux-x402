import type { Request, Response } from 'express'

export function chartHandler(req: Request, res: Response): void {
  const chartType = (req.query.type as string) || 'bar'
  const validTypes = ['bar', 'line', 'pie']

  if (!validTypes.includes(chartType)) {
    res.status(400).json({ error: `Invalid chart type. Must be one of: ${validTypes.join(', ')}` })
    return
  }

  const sampleData = {
    bar: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [120, 200, 150, 280] },
    line: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'], values: [10, 25, 15, 30, 22] },
    pie: { labels: ['A', 'B', 'C'], values: [45, 30, 25] },
  }

  res.json({
    chartType,
    data: sampleData[chartType as keyof typeof sampleData],
    renderedAt: new Date().toISOString(),
  })
}
