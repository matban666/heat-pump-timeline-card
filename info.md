# Heat Pump Timeline Card

An advanced interactive timeline chart for monitoring heat pump performance in Home Assistant.

## Key Features

✨ **Interactive Zoom** - Click and drag to zoom into specific time periods

📊 **SCOP Calculations** - Automatic calculation of Seasonal Coefficient of Performance for CH, DHW, and Combined modes

🌡️ **Comprehensive Metrics** - Display flow/return temps, Delta-T, power consumption, COP, and more

🎯 **Smart Tooltips** - Hover over any line to see related metrics and calculations

🔥 **DHW Mode Tracking** - Visual indication of domestic hot water heating periods

📈 **Step Interpolation** - Accurate representation of periodic sensor data

🎨 **Line Embiggen** - Lines highlight on hover for better visibility

⏱️ **Flexible Time Ranges** - View 1 hour to 1 month, or create custom ranges with zoom

## Perfect For

- Heat pump owners wanting detailed performance insights
- Monitoring COP and efficiency across different operating modes
- Understanding heating patterns and optimization opportunities
- Tracking DHW vs space heating efficiency
- Analyzing temperature curves and setpoints

## Quick Start

```yaml
type: custom:heat-pump-timeline-card
title: Heat Pump Performance
power_in_entity: sensor.heat_pump_power_input
power_out_entity: sensor.heat_pump_power_output
flow_temp_entity: sensor.heat_pump_flow_temp
return_temp_entity: sensor.heat_pump_return_temp
mode_entity: sensor.heat_pump_mode
```

See the full README for comprehensive configuration options.
