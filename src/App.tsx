import "./App.css";
import React from "react";

function App() {
  React.useEffect(() => {
    const ws = new WebSocket(
      "ws://localhost:8180/steve/websocket/CentralSystemService/john",
      "ocpp1.6"
    );
  }, []);

  return <div className="App"></div>;
}

export default App;
