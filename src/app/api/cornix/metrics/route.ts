import { NextRequest, NextResponse } from "next/server";
import { CornixMetricsService } from "@/lib/monitoring/cornix-metrics";

// GET - Get metrics summary
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const feature = searchParams.get("feature");

  try {
    // Get overall summary
    const summary = await CornixMetricsService.getSummary(days);

    // Get feature-specific stats if requested
    let featureStats = null;
    if (feature) {
      featureStats = await CornixMetricsService.getFeatureStats(feature, days);
    }

    // Get recent metrics
    const recentMetrics = await CornixMetricsService.getRecentMetrics(feature || undefined, 100);

    return NextResponse.json({
      success: true,
      summary,
      featureStats,
      recentMetrics,
      period: { days },
    });
  } catch (error) {
    console.error("[CornixMetrics API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// DELETE - Clear old metrics
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const daysToKeep = parseInt(searchParams.get("daysToKeep") || "90", 10);

  try {
    const deletedCount = await CornixMetricsService.clearOldMetrics(daysToKeep);

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Cleared ${deletedCount} old metrics (older than ${daysToKeep} days)`,
    });
  } catch (error) {
    console.error("[CornixMetrics API] Delete error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
