# Discrete Event Simulation Python Code Generator

A web-based visual tool for designing and simulating discrete event systems, with automatic Python code generation using SimPy.

## What This Is

This application provides an intuitive, drag-and-drop interface for building discrete event simulation (DES) models. Users can visually construct systems with sources (arrival processes), servers (processing units), and sinks (departures), configure distributions, and generate executable Python code using the SimPy library.

The tool is designed for:
- Students learning discrete event simulation concepts
- Researchers prototyping simulation models
- Engineers building simulation software
- Educators teaching DES principles

## Features

- **Visual Model Builder**: Drag-and-drop interface using React Flow to create DES models
- **Component Library**: Pre-built nodes for sources, servers, and sinks with configurable parameters
- **Distribution Support**: Exponential, normal, uniform, and custom distributions for arrival and service times
- **Real-time Simulation**: Interactive playground to run and visualize simulation results
- **Code Generation**: Automatic generation of SimPy Python code from visual models
- **Syntax Highlighting**: Built-in code editor with syntax highlighting for generated Python code
- **Theory Section**: Educational content explaining DES concepts and SimPy usage
- **Export Functionality**: Export generated code and simulation results

## Technologies Used

- **Frontend**: React 19, TypeScript, Vite
- **UI Components**: Tailwind CSS, Lucide React icons
- **Flow Diagrams**: React Flow (@xyflow/react)
- **Charts**: Recharts for simulation visualization
- **Code Highlighting**: React Syntax Highlighter
- **AI Integration**: Google Generative AI for enhanced code generation

## Installation and Local Development

### Prerequisites

- Node.js (version 18 or higher)
- npm or yarn package manager

### Installation Steps

1. **Clone the repository** (if applicable) or navigate to the project directory:
   ```bash
   cd /path/to/DES-Playground
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser** and navigate to `http://localhost:5173` (or the port shown in the terminal).

### Build for Production

To build the application for production:

```bash
npm run build
```

To preview the production build:

```bash
npm run preview
```

## How to Use

### Getting Started

1. Open the application in your browser after running `npm run dev`.
2. The app has three main sections accessible via tabs:

### Theory Tab
- Learn about discrete event simulation concepts
- Understand SimPy fundamentals
- Explore examples and best practices

### Playground Tab
- **Visual Editor**: Drag nodes from the sidebar onto the canvas
- **Configure Nodes**:
  - **Source**: Set arrival distribution (e.g., exponential with mean 5)
  - **Server**: Configure capacity and service distribution
  - **Sink**: Define departure behavior
- **Connect Nodes**: Draw edges between nodes to define the flow
- **Run Simulation**: Click the play button to execute the simulation
- **View Results**: See real-time charts and statistics

### Editor Tab
- **Generate Code**: Automatically convert your visual model to SimPy Python code
- **Edit Code**: Manually modify the generated code if needed
- **Export Code**: Copy or download the Python script
- **Run Code**: Execute the code directly in the browser (if supported)

### Example Workflow

1. Create a simple M/M/1 queue:
   - Add a Source node with exponential arrivals (mean = 5)
   - Add a Server node with exponential service (mean = 4)
   - Add a Sink node
   - Connect Source → Server → Sink

2. Run the simulation in the Playground to see queue statistics

3. Switch to the Editor tab to generate and export the equivalent SimPy code


## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## License

This project is private and for educational purposes.
