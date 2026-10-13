import React from 'react'

interface PerformanceMetricsProps {
  data: {
    tokenUsage: number
    latency: number // ms
    cost: number // dollars
    successRate: number // percentage
  }
}

export const PerformanceMetrics = ({ data }: PerformanceMetricsProps) => {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  return (
    <div className="bg-white rounded-lg shadow border p-6">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Performance Metrics</h2>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Token Usage */}
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600">
            {formatNumber(data.tokenUsage)}
          </div>
          <p className="text-sm text-gray-500 mt-1">Tokens Used</p>
          <div className="h-0.5 mt-2 bg-blue-200 rounded">
            <div className="h-0.5 bg-blue-600 rounded" style={{ width: '70%' }}></div>
          </div>
          <p className="mt-1 text-xs text-gray-400">+150 tokens/min</p>
        </div>
        
        {/* Latency */}
        <div className="text-center">
          <div className="text-3xl font-bold text-green-600">
            {data.latency}ms
          </div>
          <p className="text-sm text-gray-500 mt-1">Average Latency</p>
          <div className="h-0.5 mt-2 bg-green-200 rounded">
            <div className="h-0.5 bg-green-600 rounded" style={{ width: Math.max(0, Math.min(100, (200 - data.latency) / 200 * 100)) }}></div>
          </div>
          <p className="mt-1 text-xs text-gray-400">{data.latency < 100 ? 'Good' : data.latency < 200 ? 'Fair' : 'Slow'}</p>
        </div>
        
        {/* Cost */}
        <div className="text-center">
          <div className="text-3xl font-bold text-purple-600">
            ${data.cost.toFixed(2)}
          </div>
          <p className="text-sm text-gray-500 mt-1">Total Cost</p>
          <div className="h-0.5 mt-2 bg-purple-200 rounded">
            <div className="h-0.5 bg-purple-600 rounded" style={{ width: Math.min(90, data.cost * 1000) }}></div>
          </div>
          <p className="mt-1 text-xs text-gray-400">+$0.002/task</p>
        </div>
        
        {/* Success Rate */}
        <div className="text-center">
          <div className="text-3xl font-bold text-indigo-600">
            {data.successRate.toFixed(1)}%
          </div>
          <p className="text-sm text-gray-500 mt-1">Success Rate</p>
          <div className="relative h-0.5 mt-2 bg-gray-200 rounded">
            <div className="h-0.5 bg-indigo-600 rounded" style={{ width: `${data.successRate}%` }}></div>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {data.successRate >= 95 ? 'Excellent' : data.successRate >= 85 ? 'Good' : 'Needs Improvement'}
          </p>
        </div>
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Resource Usage Trend</h3>
        <div className="h-20 bg-gray-100 rounded overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-green-500" style={{ width: '65%' }}></div>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Simulated trend showing resource utilization over the last hour
        </p>
      </div>
    </div>
  )
}