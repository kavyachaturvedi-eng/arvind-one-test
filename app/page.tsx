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
import Attendance from "@/components/modules/Attendance";
import Offers from "@/components/modules/Offers";
import Health from "@/components/modules/Health";
import BillHistory from "@/components/modules/BillHistory";
import Store360 from "@/components/modules/Store360";
import Inventory from "@/components/modules/Inventory";
import StoreView from "@/components/modules/StoreDetail";
import HqTasks from "@/components/modules/HqTasks";
import ActivityLog from "@/components/modules/ActivityLog";
import Stores from "@/components/modules/Stores";
import ReplenRunView from "@/components/modules/ReplenRun";
import Allocation from "@/components/modules/Allocation";
import Otb from "@/components/modules/Otb";
import Asks from "@/components/modules/Asks";
import PlanningSettings from "@/components/modules/PlanningSettings";

function Router() {
  const { module } = useApp();
  switch (module) {
    case "home":
      return <Home />;
    // ── Retail planning ──
    case "store360":
      return <Store360 />;
    case "store":
      return <StoreView />;
    case "inv":
      return <Inventory />;
    case "run":
      return <ReplenRunView />;
    case "alloc":
      return <Allocation />;
    case "otb":
      return <Otb />;
    case "asks":
      return <Asks />;
    case "planset":
      return <PlanningSettings />;
    case "hqtask":
      return <HqTasks />;
    case "log":
      return <ActivityLog />;
    case "stores":
      return <Stores />;

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
    case "attendance":
      return <Attendance />;
    case "offers":
      return <Offers />;
    case "health":
      return <Health />;
    case "bills":
      return <BillHistory />;
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
