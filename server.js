// Render WebSocket Server for Portfolio Console
// Deploy this to Render.com as a Web Service
// This server provides real-time console functionality for your projects

const WebSocket = require('ws');
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for Render
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-portfolio-domain.vercel.app', 'https://your-portfolio-domain.netlify.app']
    : true,
  credentials: true
}));

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.json({ 
    status: 'Render WebSocket Server Running',
    websocket: `wss://${req.get('host')}`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    render_service: process.env.RENDER_SERVICE_NAME || 'websocket-server'
  });
});

// Health check for Render's health monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: wss ? wss.clients.size : 0
  });
});

// WebSocket endpoint info
app.get('/websocket', (req, res) => {
  res.json({
    websocket_url: `wss://${req.get('host')}`,
    supported_projects: [
      'cpu-scheduler',
      'custom-project-1',
      'custom-project-2'
    ],
    instructions: 'Connect via WebSocket and send JSON messages with type and content'
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Render WebSocket Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`WebSocket URL: wss://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + port}`);
});

const wss = new WebSocket.Server({ server });

// Track active connections and projects
const activeConnections = new Map();
const projectProcesses = new Map();

wss.on('connection', (ws, req) => {
  const connectionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  console.log(`Client connected: ${connectionId}`);
  
  // Store connection info
  activeConnections.set(connectionId, {
    ws,
    connectedAt: new Date(),
    project: null,
    process: null
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    content: 'Welcome to Render WebSocket Console!\nConnected successfully.\nType "help" for available commands.'
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'input') {
        const command = data.content.trim();
        const project = data.project || 'default';
        
        console.log(`[${connectionId}] Received command: ${command} for project: ${project}`);
        
        handleCommand(ws, connectionId, command, project);
      } else if (data.type === 'init') {
        // Initialize connection for specific project
        const project = data.project;
        const connection = activeConnections.get(connectionId);
        if (connection) {
          connection.project = project;
        }
        
        ws.send(JSON.stringify({
          type: 'system',
          content: `Initialized for project: ${project}\nType "run" to start the application.`
        }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        content: 'Error processing command'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log(`Client disconnected: ${connectionId}`);
    const connection = activeConnections.get(connectionId);
    if (connection && connection.process) {
      connection.process.kill('SIGTERM');
    }
    activeConnections.delete(connectionId);
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${connectionId}:`, error);
  });
});

function handleCommand(ws, connectionId, command, project) {
  const connection = activeConnections.get(connectionId);
  
  switch (command.toLowerCase()) {
    case 'help':
      ws.send(JSON.stringify({
        type: 'output',
        content: 'Available commands:\n' +
                '- run: Start the application\n' +
                '- help: Show this help message\n' +
                '- status: Show server and process status\n' +
                '- stop: Stop the running process\n' +
                '- projects: List available projects\n' +
                '- info: Show project information\n\n' +
                'Once application is running, all input goes directly to the program.'
      }));
      break;
      
    case 'run':
      if (connection && connection.process) {
        ws.send(JSON.stringify({
          type: 'output',
          content: 'Application is already running. Use "stop" to terminate it first.'
        }));
        return;
      }
      
      ws.send(JSON.stringify({
        type: 'output',
        content: `Starting ${project} application...`
      }));
      
      startProject(ws, connectionId, project);
      break;
      
    case 'status':
      const status = {
        server: 'running',
        connections: wss.clients.size,
        project: connection?.project || 'none',
        process: connection?.process ? 'running' : 'stopped',
        uptime: process.uptime(),
        memory: process.memoryUsage()
      };
      
      ws.send(JSON.stringify({
        type: 'output',
        content: `Server Status:\n` +
                `- Server: ${status.server}\n` +
                `- Active connections: ${status.connections}\n` +
                `- Current project: ${status.project}\n` +
                `- Process: ${status.process}\n` +
                `- Uptime: ${Math.floor(status.uptime)}s\n` +
                `- Memory: ${Math.round(status.memory.heapUsed / 1024 / 1024)}MB`
      }));
      break;
      
    case 'stop':
      if (connection && connection.process) {
        connection.process.kill('SIGTERM');
        ws.send(JSON.stringify({
          type: 'output',
          content: 'Process terminated.'
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'output',
          content: 'No process is currently running.'
        }));
      }
      break;
      
    case 'projects':
      ws.send(JSON.stringify({
        type: 'output',
        content: 'Available projects:\n' +
                '- cpu-scheduler: Java CPU Scheduler with algorithms\n' +
                '- custom-project-1: Your custom project 1\n' +
                '- custom-project-2: Your custom project 2\n\n' +
                'Use "init" command with project name to set active project.'
      }));
      break;
      
    case 'info':
      ws.send(JSON.stringify({
        type: 'output',
        content: `Project: ${project}\n` +
                `Description: ${getProjectInfo(project).description}\n` +
                `Technologies: ${getProjectInfo(project).tech.join(', ')}\n` +
                `Repository: ${getProjectInfo(project).repo}`
      }));
      break;
      
    default:
      // Send input to running process if available
      if (connection && connection.process) {
        connection.process.stdin.write(command + '\n');
      } else {
        ws.send(JSON.stringify({
          type: 'output',
          content: `Command not recognized: ${command}\n` +
                  'Type "help" for available commands or "run" to start the application.'
        }));
      }
  }
}

function getProjectInfo(project) {
  const projects = {
    'cpu-scheduler': {
      description: 'Java CPU Scheduler with multiple algorithms',
      tech: ['Java', 'Maven', 'Algorithms', 'Operating Systems'],
      repo: 'https://github.com/ghassanelgendy/cpu-schedulers'
    },
    'custom-project-1': {
      description: 'Your custom project 1',
      tech: ['Node.js', 'React', 'TypeScript'],
      repo: 'https://github.com/yourusername/project1'
    },
    'custom-project-2': {
      description: 'Your custom project 2',
      tech: ['Python', 'Django', 'PostgreSQL'],
      repo: 'https://github.com/yourusername/project2'
    }
  };
  
  return projects[project] || projects['cpu-scheduler'];
}

function startProject(ws, connectionId, project) {
  const connection = activeConnections.get(connectionId);
  if (!connection) return;
  
  let process;
  
  switch (project) {
    case 'cpu-scheduler':
      process = startCpuScheduler(ws, connectionId);
      break;
    case 'custom-project-1':
      process = startCustomProject1(ws, connectionId);
      break;
    case 'custom-project-2':
      process = startCustomProject2(ws, connectionId);
      break;
    default:
      ws.send(JSON.stringify({
        type: 'error',
        content: `Unknown project: ${project}`
      }));
      return;
  }
  
  if (process) {
    connection.process = process;
    
    process.stdout.on('data', (data) => {
      ws.send(JSON.stringify({
        type: 'output',
        content: data.toString()
      }));
    });
    
    process.stderr.on('data', (data) => {
      ws.send(JSON.stringify({
        type: 'output',
        content: data.toString()
      }));
    });
    
    process.on('close', (code) => {
      connection.process = null;
      ws.send(JSON.stringify({
        type: 'output',
        content: `Process exited with code ${code}`
      }));
    });
    
    process.on('error', (error) => {
      connection.process = null;
      ws.send(JSON.stringify({
        type: 'error',
        content: `Process error: ${error.message}`
      }));
    });
  }
}

function startCpuScheduler(ws, connectionId) {
  ws.send(JSON.stringify({
    type: 'output',
    content: 'Starting CPU Scheduler setup...'
  }));
  
  // For demo purposes, simulate the CPU scheduler
  // In production, you would clone and run the actual Java program
  const process = spawn('node', ['-e', `
    console.log('=== CPU Scheduler Simulation ===');
    console.log('Select scheduling algorithm:');
    console.log('1. First Come First Serve (FCFS)');
    console.log('2. Shortest Job First (SJF)');
    console.log('3. Priority Scheduling');
    console.log('4. Round Robin');
    console.log('Enter choice (1-4): ');
    
    process.stdin.on('data', (data) => {
      const input = data.toString().trim();
      if (input.match(/^[1-4]$/)) {
        const algorithms = ['FCFS', 'SJF', 'Priority', 'Round Robin'];
        console.log('Selected:', algorithms[parseInt(input) - 1]);
        console.log('Enter number of processes (1-10): ');
      } else if (input.match(/^\\d+$/)) {
        const num = parseInt(input);
        if (num >= 1 && num <= 10) {
          console.log('Creating', num, 'processes...');
          console.log('Process Details:');
          for (let i = 1; i <= num; i++) {
            const burstTime = Math.floor(Math.random() * 10) + 1;
            const priority = Math.floor(Math.random() * 5) + 1;
            console.log('  P' + i + ': Burst=' + burstTime + 'ms, Priority=' + priority);
          }
          console.log('Executing scheduling algorithm...');
          console.log('Scheduling Results:');
          console.log('  Average Waiting Time:', (Math.random() * 20 + 5).toFixed(1) + 'ms');
          console.log('  Average Turnaround Time:', (Math.random() * 30 + 15).toFixed(1) + 'ms');
          console.log('  CPU Utilization:', (Math.random() * 20 + 80).toFixed(1) + '%');
          console.log('Simulation complete. Type "run" to start again.');
        } else {
          console.log('Please enter a number between 1-10');
        }
      } else {
        console.log('Invalid input. Please enter 1-4 for algorithm or 1-10 for processes.');
      }
    });
  `], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  return process;
}

function startCustomProject1(ws, connectionId) {
  ws.send(JSON.stringify({
    type: 'output',
    content: 'Starting Custom Project 1...'
  }));
  
  // Simulate a Node.js/React project
  const process = spawn('node', ['-e', `
    console.log('=== Custom Project 1 ===');
    console.log('React/TypeScript Application');
    console.log('Available commands:');
    console.log('- npm start: Start development server');
    console.log('- npm build: Build for production');
    console.log('- npm test: Run tests');
    console.log('Enter command: ');
    
    process.stdin.on('data', (data) => {
      const input = data.toString().trim();
      switch(input) {
        case 'npm start':
          console.log('Starting development server...');
          console.log('Server running on http://localhost:3000');
          break;
        case 'npm build':
          console.log('Building for production...');
          console.log('Build completed successfully!');
          break;
        case 'npm test':
          console.log('Running tests...');
          console.log('✓ All tests passed');
          break;
        default:
          console.log('Unknown command. Try: npm start, npm build, npm test');
      }
    });
  `], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  return process;
}

function startCustomProject2(ws, connectionId) {
  ws.send(JSON.stringify({
    type: 'output',
    content: 'Starting Custom Project 2...'
  }));
  
  // Simulate a Python/Django project
  const process = spawn('node', ['-e', `
    console.log('=== Custom Project 2 ===');
    console.log('Python/Django Application');
    console.log('Available commands:');
    console.log('- python manage.py runserver: Start Django server');
    console.log('- python manage.py migrate: Run migrations');
    console.log('- python manage.py createsuperuser: Create admin user');
    console.log('Enter command: ');
    
    process.stdin.on('data', (data) => {
      const input = data.toString().trim();
      switch(input) {
        case 'python manage.py runserver':
          console.log('Starting Django development server...');
          console.log('Server running on http://127.0.0.1:8000/');
          break;
        case 'python manage.py migrate':
          console.log('Running migrations...');
          console.log('Migrations completed successfully!');
          break;
        case 'python manage.py createsuperuser':
          console.log('Creating superuser...');
          console.log('Superuser created successfully!');
          break;
        default:
          console.log('Unknown command. Try: python manage.py runserver, migrate, createsuperuser');
      }
    });
  `], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  return process;
}

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

console.log('Render WebSocket Server initialized');
console.log('Ready to handle console connections for multiple projects'); 