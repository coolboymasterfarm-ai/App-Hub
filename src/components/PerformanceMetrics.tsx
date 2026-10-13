import React from 'react'

interface PerformanceMetricsProps {
  data: {
    tokenUsage: string
    avgLatency: string
    successRate: string
    cost: string
  } | null
}

const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
        <p className="text-center text-gray-500 py-8">Loading metrics...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{data.tokenUsage}</div>
          <p className="text-sm text-gray-500">Tokens Used</p>
        </div>
        
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{data.avgLatency}</div>
          <p className="text-sm text-gray-500">Avg Response Time</p>
        </div>
        
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{data.successRate}</div>
          <p className="text-sm text-gray-500">Success Rate</p>
        </div>
        
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{data.cost}</div>
          <p className="text-sm text-gray-500">Estimated Cost</p>
        </div>
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="text-lg font-semibold mb-3">Trends (Last 24h)</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-blue-50 p-3 rounded">
            <p className="text-sm font-medium text-gray-900 mb-1">Token Usage Trend</p>
            <div className="h-2 w-full bg-gray-200 rounded">
              <div className="h-2 bg-blue-500 rounded" style={{ width: '70%' }}></div>
            </div>
            <p className="mt-1 text-xs text-green-600">+12% vs yesterday</p>
          </div>
          
          <div className="bg-green-50 p-3 rounded">
            <p className="text-sm font-medium text-gray-900 mb-1">Latency Trend</p>
            <div className="h-2 w-full bg-gray-200 rounded">
              <div className="h-2 bg-green-500 rounded" style={{ width: '30%' }}></div>
            </div>
            <p className="mt-1 text-xs text-red-600">-8% vs yesterday</p>
          </div>
          
          <div className="bg-purple-50 p-3 rounded">
            <p className="text-sm font-medium text-gray-900 mb-1">Success Rate Trend</p>
            <div className="h-2 w-full bg-gray-200 rounded">
              <div className="h-2 bg-purple-500 rounded" style={{ width: '85%' }}></div>
            </div>
            <p className="mt-1 text-xs text-green-600">+2% vs yesterday</p>
          </div>
          
          <div className="bg-yellow-50 p-3 rounded">
            <p className="text-sm font-medium text-gray-900 mb-1">Cost Trend</p>
            <div className="h-2 w-full bg-gray-200 rounded">
              <div className="h-2 bg-yellow-500 rounded" style={{ width: '40%' }}></div>
            </div>
            <p className="mt-1 text-xs text-red-600">+5% vs yesterday</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PerformanceMetrics