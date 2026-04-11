"use client";

import { motion } from "framer-motion";
import { Card } from "./Card";
import { Button } from "./Button";
import { PropertyCard } from "./PropertyCard";
import { Table } from "./Table";
import { Sidebar } from "./Sidebar";
import { 
  Building2, 
  Users, 
  DollarSign, 
  FileText, 
  TrendingUp, 
  TrendingDown,
  Plus,
  Calendar,
  AlertCircle
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/utils/cn";

interface MetricCardProps {
  title: string;
  value: string;
  trend: string;
  positive: boolean;
  icon: React.ReactNode;
}

function MetricCard({ title, value, trend, positive, icon }: MetricCardProps) {
  const { theme } = useTheme();
  const TrendIcon = positive ? TrendingUp : TrendingDown;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted">{title}</p>
            <p className="text-2xl font-bold text-text-dark">{value}</p>
          </div>
        </div>
      </div>
      <div className={cn(
        "flex items-center text-sm mt-4",
        positive ? "text-success" : "text-danger"
      )}>
        <TrendIcon className="w-4 h-4 mr-1" />
        {trend}
      </div>
    </Card>
  );
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  time: string;
  status: string;
}

interface Property {
  id: string;
  name: string;
  location: string;
  units: number;
  occupied: number;
  revenue: string;
}

export function Dashboard() {
  const { theme } = useTheme();

  // Mock data
  const metrics = [
    {
      title: "Total Properties",
      value: "24",
      trend: "+2 this month",
      positive: true,
      icon: <Building2 className="w-6 h-6 text-primary" />
    },
    {
      title: "Occupancy Rate",
      value: "87%",
      trend: "+3% vs last month",
      positive: true,
      icon: <Users className="w-6 h-6 text-primary" />
    },
    {
      title: "Monthly Revenue",
      value: "$124,500",
      trend: "+8.3% vs last month",
      positive: true,
      icon: <DollarSign className="w-6 h-6 text-primary" />
    },
    {
      title: "Outstanding Rent",
      value: "$8,450",
      trend: "-12% from yesterday",
      positive: true,
      icon: <FileText className="w-6 h-6 text-primary" />
    }
  ];

  const recentActivity: ActivityItem[] = [
    {
      id: "1",
      type: "payment",
      description: "John Doe paid rent for Sunset Apartments",
      time: "2 hours ago",
      status: "completed"
    },
    {
      id: "2", 
      type: "maintenance",
      description: "Maintenance request submitted for Building A",
      time: "4 hours ago",
      status: "pending"
    },
    {
      id: "3",
      type: "tenant",
      description: "New tenant onboarded for Oak Street Property",
      time: "1 day ago",
      status: "completed"
    }
  ];

  const properties: Property[] = [
    {
      id: "1",
      name: "Sunset Apartments",
      location: "London, UK",
      units: 12,
      occupied: 11,
      revenue: "$18,500"
    },
    {
      id: "2",
      name: "Oak Street Property",
      location: "Manchester, UK", 
      units: 8,
      occupied: 7,
      revenue: "$12,000"
    },
    {
      id: "3",
      name: "Riverside Complex",
      location: "Birmingham, UK",
      units: 24,
      occupied: 20,
      revenue: "$35,000"
    }
  ];

  const activityColumns = [
    {
      key: "description" as keyof ActivityItem,
      title: "Activity",
      className: "font-medium"
    },
    {
      key: "time" as keyof ActivityItem,
      title: "Time",
      className: "text-muted"
    },
    {
      key: "status" as keyof ActivityItem,
      title: "Status",
      render: (value: string) => (
        <span className={cn(
          "px-2 py-1 text-xs rounded-full",
          value === "completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
        )}>
          {value}
        </span>
      )
    }
  ];

  return (
    <div className={cn("min-h-screen bg-background-" + theme)}>
      <div className="flex">
        <Sidebar />
        
        {/* Main Content */}
        <main className="flex-1 p-6 space-y-6">
          {/* Header */}
          <motion.div
            className="flex items-center justify-between"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div>
              <h1 className="text-2xl font-semibold text-text-dark">Dashboard</h1>
              <p className="text-sm text-muted mt-1">Welcome back! Here's what's happening with your properties.</p>
            </div>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Property
            </Button>
          </motion.div>

          {/* Metrics Row */}
          <div className="flex flex-col lg:flex-row gap-6">
            {metrics.map((metric, index) => (
              <motion.div
                key={metric.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="flex-1"
              >
                <MetricCard {...metric} />
              </motion.div>
            ))}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Properties Section */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-medium text-text-dark">Recent Properties</h2>
                  <Button variant="ghost" size="sm">View All</Button>
                </div>
                <div className="space-y-4">
                  {properties.map((property, index) => (
                    <motion.div
                      key={property.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 + index * 0.1 }}
                    >
                      <PropertyCard {...property} />
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>

            {/* Recent Activity */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-medium text-text-dark">Recent Activity</h2>
                  <Button variant="ghost" size="sm">
                    <Calendar className="w-4 h-4" />
                  </Button>
                </div>
                <Table
                  data={recentActivity}
                  columns={activityColumns}
                  className="border-0"
                />
              </Card>
            </motion.div>
          </div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Card className="p-6">
              <h2 className="text-xl font-medium text-text-dark mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button variant="secondary" className="justify-center">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Property
                </Button>
                <Button variant="secondary" className="justify-center">
                  <Users className="w-4 h-4 mr-2" />
                  Add Tenant
                </Button>
                <Button variant="secondary" className="justify-center">
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Report
                </Button>
                <Button variant="secondary" className="justify-center">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Maintenance
                </Button>
              </div>
            </Card>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

