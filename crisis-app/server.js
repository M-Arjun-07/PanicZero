import { Server } from "socket.io";
const io = new Server(3000, {
  cors: {
    origin: "*",
  }
});

let currentState = {
  hazards: [],
  route: []
};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  
  // Sync state to the newly connected client immediately
  socket.emit("sync_state", currentState);

  // Listen for alerts triggered from Mobile or Desktop
  socket.on("trigger_alert", (data) => {
    console.log("Alert triggered:", data);
    
    // Check if hazard is already in the list to prevent duplicates
    const hazardExists = currentState.hazards.find(h => h.room === data.hazards[0].room && h.type === data.hazards[0].type);
    
    if (!hazardExists) {
        currentState.hazards = [...currentState.hazards, ...data.hazards];
    }
    currentState.route = data.route || currentState.route; 
    
    // Broadcast updated state to ALL connected clients (Mobile + Desktop)
    io.emit("sync_state", currentState);
  });
  
  // Listen for reset from Desktop
  socket.on("reset_system", () => {
    console.log("System reset by Command Center");
    currentState = { hazards: [], route: [] };
    io.emit("sync_state", currentState);
  });
});

console.log("🚀 CrisisMesh Socket.IO Server running on port 3000");
