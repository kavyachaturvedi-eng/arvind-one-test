"use client";

import React from "react";
import { AppProvider, useApp } from "@/lib/state";
import { Shell } from "@/components/Shell";
import Login from "@/components/Login";
import Copilot from "@/components/Copilot";

import Home from "@/components/modules/Home";
import LiveExecution from "@/components/modules/LiveExecution";
import Truth from "@/components/modules/Truth";
import SaveTheSale from "@/components/modules/SaveTheSale";
import SizeSets from "@/components/modules/SizeSets";
import Omni from "@/components/modules/Omni";
import Outward from "@/components/modules/Outward";
import StoreDay from "@/components/modules/StoreDay";
import Tickets from "@/components/modules/Tickets";
import Cash from "@/components/modules/Cash";
import Reallocation from "@/components/modules/Reallocation";
import StrategicMoves from "@/components/modules/StrategicMoves";
import Performance from "@/components/modules/Performance";
import Catchment from "@/components/modules/Catchment";
import AskOne from "@/components/modules/AskOne";
import Governance from "@/components/modules/Governance";
import Grn from "@/components/modules/Grn";
import Replenishment from "@/components/modules/Replenishment";
import Crm from "@/components/modules/Crm";
import Pos from "@/components/modules/Pos";
import Reports from "@/components/modules/Reports";
import CeoHome from "@/components/modules/CeoHome";
import Trainings from "@/components/modules/Trainings";
import Agents from "@/components/modules/Agents";
import Team from "@/components/modules/Team";
import MerchMoves from "@/components/modules/MerchMoves";
import StockLookup from "@/components/modules/StockLookup";
import MyShift from "@/components/modules/MyShift";
import StaffHub from "@/components/modules/StaffHub";

function Router() {
  const { module } = useApp();
  switch (module) {
    case "home":
      return <Home />;
    case "live":
      return <LiveExecution />;
    case "truth":
      return <Truth />;
    case "savesale":
      return <SaveTheSale />;
    case "sizeset":
      return <SizeSets />;
    case "omni":
      return <Omni />;
    case "outward":
      return <Outward />;
    case "storeday":
      return <StoreDay />;
    case "tickets":
      return <Tickets />;
    case "cash":
      return <Cash />;
    case "allocate":
      return <Reallocation />;
    case "moves":
      return <StrategicMoves />;
    case "performance":
      return <Performance />;
    case "catchment":
      return <Catchment />;
    case "ask":
      return <AskOne />;
    case "governance":
      return <Governance />;
    case "grn":
      return <Grn />;
    case "replenish":
      return <Replenishment />;
    case "crm":
      return <Crm />;
    case "pos":
      return <Pos />;
    case "reports":
      return <Reports />;
    case "exec":
      return <CeoHome />;
    case "trainings":
      return <Trainings />;
    case "agents":
      return <Agents />;
    case "team":
      return <Team />;
    case "merch":
      return <MerchMoves />;
    case "lookup":
      return <StockLookup />;
    case "shift":
      return <MyShift />;
    case "hub":
      return <StaffHub />;
    default:
      return <Home />;
  }
}

function App() {
  const app = useApp();
  if (!app.authed) return <Login />;
  return (
    <>
      <Shell>
        <Router />
      </Shell>
      <Copilot />
    </>
  );
}

export default function Page() {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
}
