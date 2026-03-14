import React from 'react';
import { BookOpen, Activity, GitMerge, Clock } from 'lucide-react';

export default function Theory() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-700">
        <h2 className="text-2xl font-bold text-indigo-400 mb-4 flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          Discrete Event Simulation (DES)
        </h2>
        <p className="text-gray-300 leading-relaxed mb-6">
          Discrete Event Simulation models the operation of a system as a discrete sequence of events in time. Each event occurs at a particular instant in time and marks a change of state in the system. Between consecutive events, no change in the system is assumed to occur; thus the simulation time can directly jump to the occurrence time of the next event.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="bg-gray-900/50 p-5 rounded-lg border border-gray-700">
            <Activity className="w-8 h-8 text-emerald-400 mb-3" />
            <h3 className="text-lg font-semibold text-gray-200 mb-2">Entities</h3>
            <p className="text-sm text-gray-400">
              The objects that move through the system. Examples: Customers in a bank, parts in a factory, data packets in a network.
            </p>
          </div>
          <div className="bg-gray-900/50 p-5 rounded-lg border border-gray-700">
            <GitMerge className="w-8 h-8 text-amber-400 mb-3" />
            <h3 className="text-lg font-semibold text-gray-200 mb-2">Resources</h3>
            <p className="text-sm text-gray-400">
              Entities compete for resources. A resource has a capacity. Examples: Tellers, machines, bandwidth.
            </p>
          </div>
          <div className="bg-gray-900/50 p-5 rounded-lg border border-gray-700">
            <Clock className="w-8 h-8 text-purple-400 mb-3" />
            <h3 className="text-lg font-semibold text-gray-200 mb-2">Events</h3>
            <p className="text-sm text-gray-400">
              Instantaneous occurrences that change the state of the system. Examples: Arrival of a customer, completion of service.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-700">
        <h2 className="text-2xl font-bold text-indigo-400 mb-4">Queueing Theory & Kendall's Notation</h2>
        <p className="text-gray-300 leading-relaxed mb-6">
          Queueing theory is the mathematical study of waiting lines, or queues. A queueing model is constructed so that queue lengths and waiting time can be predicted.
        </p>
        
        <div className="bg-gray-900 p-6 rounded-lg border border-gray-700 mb-6">
          <h3 className="text-xl font-mono text-emerald-400 mb-4 text-center">A / B / c / K / N / D</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><strong className="text-indigo-400">A:</strong> Arrival Process (e.g., M for Markovian/Exponential)</div>
            <div><strong className="text-indigo-400">B:</strong> Service Time Distribution (e.g., M, D for Deterministic, G for General)</div>
            <div><strong className="text-indigo-400">c:</strong> Number of Servers (1, 2, ..., ∞)</div>
            <div><strong className="text-indigo-400">K:</strong> System Capacity (default ∞)</div>
            <div><strong className="text-indigo-400">N:</strong> Population Size (default ∞)</div>
            <div><strong className="text-indigo-400">D:</strong> Queue Discipline (e.g., FIFO, LIFO)</div>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-gray-200 mb-3 mt-8">Common Distributions</h3>
        <ul className="space-y-3 text-gray-300">
          <li><strong className="text-emerald-400">Exponential (Markovian):</strong> Used for modeling the time between independent events that occur at a constant average rate. The standard for M/M/c queues.</li>
          <li><strong className="text-emerald-400">Normal (Gaussian):</strong> Used when the variation in time is due to the sum of many small, independent random factors.</li>
          <li><strong className="text-emerald-400">Uniform:</strong> Used when an event is equally likely to occur anywhere within a specific range [min, max].</li>
          <li><strong className="text-emerald-400">Triangular:</strong> Used when you know the minimum, maximum, and most likely (mode) times, often based on expert estimates rather than hard data.</li>
        </ul>
      </div>
    </div>
  );
}
