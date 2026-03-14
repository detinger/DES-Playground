import { Node, Edge } from '@xyflow/react';
import { NodeData, DistributionParams } from '../types';

function getPythonDistribution(dist?: DistributionParams): string {
  if (!dist) return 'random.expovariate(1.0 / 1.0)';

  switch (dist.type) {
    case 'exponential':
      return `random.expovariate(1.0 / ${dist.mean || 1.0})`;
    case 'normal':
      return `max(0, random.gauss(${dist.mean || 1.0}, ${dist.stdDev || 0.5}))`;
    case 'uniform':
      return `random.uniform(${dist.min || 0}, ${dist.max || 10})`;
    case 'triangular':
      return `random.triangular(${dist.min || 0}, ${dist.max || 10}, ${dist.mode || 5})`;
    case 'constant':
      return `${dist.value || 5}`;
    default:
      return 'random.expovariate(1.0 / 1.0)';
  }
}

export function generateSimPyCode(nodes: Node<NodeData>[], edges: Edge[]): string {
  const sources = nodes.filter(n => n.data.type === 'source');
  const servers = nodes.filter(n => n.data.type === 'server');
  
  if (sources.length === 0) {
    return `# Please add at least one Source node to generate code.`;
  }

  const source = sources[0];
  const sourceDist = getPythonDistribution(source.data.distribution);

  // Find the sequence of servers starting from the source
  const serverSequence: Node<NodeData>[] = [];
  let currentNodeId = source.id;
  
  // Prevent infinite loops in case of cycles
  const visited = new Set<string>();
  
  while (true) {
    visited.add(currentNodeId);
    const outgoingEdge = edges.find(e => e.source === currentNodeId);
    if (!outgoingEdge) break;
    
    const nextNode = nodes.find(n => n.id === outgoingEdge.target);
    if (!nextNode || visited.has(nextNode.id)) break;
    
    if (nextNode.data.type === 'server') {
      serverSequence.push(nextNode);
    }
    currentNodeId = nextNode.id;
  }

  if (serverSequence.length === 0) {
    return `# Please connect the Source to at least one Server node.`;
  }

  // Generate resource definitions
  const resourceDefs = serverSequence.map((server, index) => 
    `        self.server_${index} = simpy.Resource(env, capacity=${server.data.capacity || 1})`
  ).join('\n');

  // Generate process steps
  const processSteps = serverSequence.map((server, index) => {
    const dist = getPythonDistribution(server.data.distribution);
    return `
        # --- Process at ${server.data.label} ---
        with self.server_${index}.request() as req_${index}:
            yield req_${index}
            
            # Record wait time for this specific server if needed
            # (Simplified: we just record total system time at the end)
            
            service_time_${index} = ${dist}
            yield self.env.timeout(service_time_${index})
`;
  }).join('');

  return `import simpy
import random
import matplotlib.pyplot as plt
import numpy as np

# --- Simulation Parameters ---
RANDOM_SEED = 42
SIM_TIME = 1000

# --- Data Collection ---
system_times = []
time_points = []
queue_lengths = [] # Total entities waiting across all servers

class Model:
    def __init__(self, env):
        self.env = env
${resourceDefs}
        
    def process_entity(self, entity_id):
        arrival_time = self.env.now
        ${processSteps}
        # Entity departs
        departure_time = self.env.now
        system_times.append(departure_time - arrival_time)

def source(env, model):
    entity_id = 0
    while True:
        # Inter-arrival time
        inter_arrival = ${sourceDist}
        yield env.timeout(inter_arrival)
        
        entity_id += 1
        env.process(model.process_entity(entity_id))

def monitor(env, model):
    """Monitor queue lengths over time"""
    while True:
        time_points.append(env.now)
        
        # Calculate total queue length across all servers
        total_q = sum([
            ${serverSequence.map((_, i) => `len(model.server_${i}.queue)`).join(' +\n            ')}
        ])
        queue_lengths.append(total_q)
        
        yield env.timeout(1.0) # Sample every 1 time unit

# --- Run Simulation ---
print("Starting simulation...")
random.seed(RANDOM_SEED)
env = simpy.Environment()
model = Model(env)

env.process(source(env, model))
env.process(monitor(env, model))

env.run(until=SIM_TIME)

# --- Results & Visualization ---
avg_sys_time = np.mean(system_times) if system_times else 0
avg_queue = np.mean(queue_lengths) if queue_lengths else 0

print(f"\\n--- Simulation Results ---")
print(f"Total entities processed: {len(system_times)}")
print(f"Average System Time: {avg_sys_time:.2f}")
print(f"Average Total Queue Length: {avg_queue:.2f}")

# Plotting
plt.figure(figsize=(10, 5))

plt.plot(time_points, queue_lengths, drawstyle='steps-post', color='indigo')
plt.title('Total Queue Length Over Time')
plt.xlabel('Time')
plt.ylabel('Number of Entities in Queues')
plt.grid(True, alpha=0.3)
plt.fill_between(time_points, queue_lengths, step="post", alpha=0.2, color='indigo')

plt.tight_layout()
plt.show()
`;
}
