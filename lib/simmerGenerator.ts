import { Node, Edge } from '@xyflow/react';
import { NodeData, DistributionParams } from '../types';

function getRDistribution(dist?: DistributionParams): string {
  if (!dist) return 'rexp(1, rate = 1.0)';

  switch (dist.type) {
    case 'exponential':
      return `rexp(1, rate = 1.0 / ${dist.mean || 1.0})`;
    case 'normal':
      return `max(0, rnorm(1, mean = ${dist.mean || 1.0}, sd = ${dist.stdDev || 0.5}))`;
    case 'uniform':
      return `runif(1, min = ${dist.min || 0}, max = ${dist.max || 10})`;
    case 'triangular':
      return `triangle::rtriangle(1, a=${dist.min || 0}, b=${dist.max || 10}, c=${dist.mode || 5})`;
    case 'constant':
      return `${dist.value || 5}`;
    default:
      return 'rexp(1, rate = 1.0)';
  }
}

export function generateSimmerCode(nodes: Node<NodeData>[], edges: Edge[]): string {
  const sources = nodes.filter(n => n.data.type === 'source');
  
  if (sources.length === 0) {
    return `# Please add at least one Source node to generate code.`;
  }

  const source = sources[0];
  const sourceDist = getRDistribution(source.data.distribution);

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

  // Generate trajectory steps
  const trajectorySteps = serverSequence.map((server, index) => {
    const dist = getRDistribution(server.data.distribution);
    return `  seize("server_${index}", 1) %>%
  timeout(function() { ${dist} }) %>%
  release("server_${index}", 1)`;
  }).join(' %>%\n');

  // Generate resource definitions
  const resourceDefs = serverSequence.map((server, index) => 
    `  add_resource("server_${index}", capacity = ${server.data.capacity || 1})`
  ).join(' %>%\n');

  const hasTriangular = serverSequence.some(s => s.data.distribution?.type === 'triangular') || source.data.distribution?.type === 'triangular';
  const triangleImport = hasTriangular ? 'library(triangle)\n' : '';

  return `library(simmer)
library(simmer.plot)
${triangleImport}
set.seed(42)

# --- Define Trajectory ---
# The path an entity takes through the system
entity_path <- trajectory("entity_path") %>%
${trajectorySteps}

# --- Initialize Environment ---
env <- simmer("Model")

# --- Define Resources and Generators ---
env %>%
${resourceDefs} %>%
  add_generator("entity", entity_path, function() { ${sourceDist} })

# --- Run Simulation ---
sim_time <- 1000
env %>% run(until = sim_time)

# --- Data Collection & Plotting ---
# Get arrival and resource data
arrivals <- get_mon_arrivals(env)
resources <- get_mon_resources(env)

# Plot resource usage
plot(resources, metric = "usage", "server_0", items = "server")

# Plot arrival wait times
plot(arrivals, metric = "waiting_time")

# Print summary statistics
summary(arrivals)
`;
}
