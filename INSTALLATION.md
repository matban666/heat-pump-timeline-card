# Installation Guide

This guide walks you through installing the Heat Pump Timeline Card from GitHub.

## Prerequisites

- Home Assistant installed and running
- Access to your Home Assistant configuration directory
- Basic understanding of Lovelace dashboards

## Step-by-Step Installation

### Step 1: Download the Card

**Option A: Download via Browser**
1. Go to https://github.com/matban666/heat-pump-timeline-card
2. Click on the `dist` folder
3. Click on `heat-pump-timeline-card.js`
4. Click the **Download** button (or right-click **Raw** and "Save Link As...")

**Option B: Download via Command Line**
```bash
cd /config/www/
wget https://raw.githubusercontent.com/matban666/heat-pump-timeline-card/main/dist/heat-pump-timeline-card.js
```

### Step 2: Copy to Home Assistant

1. **Locate your `config` directory**
   - Usually `/config/` on Home Assistant OS
   - Or `~/.homeassistant/` on core installations

2. **Create `www` folder if it doesn't exist**
   ```bash
   mkdir -p /config/www
   ```

3. **Copy the file**
   - Place `heat-pump-timeline-card.js` in `/config/www/`
   - Final path should be: `/config/www/heat-pump-timeline-card.js`

### Step 3: Register as a Lovelace Resource

**Option A: Via Home Assistant UI (Easiest)**

1. Open Home Assistant
2. Go to **Settings** → **Dashboards**
3. Click the **⋮** menu (top right)
4. Select **Resources**
5. Click **+ Add Resource** (bottom right)
6. Fill in:
   - **URL**: `/local/heat-pump-timeline-card.js`
   - **Resource type**: Select **JavaScript Module**
7. Click **Create**

**Option B: Via configuration.yaml**

Add this to your `configuration.yaml`:

```yaml
lovelace:
  mode: yaml
  resources:
    - url: /local/heat-pump-timeline-card.js
      type: module
```

Then restart Home Assistant.

### Step 4: Clear Browser Cache

**Important!** Your browser caches JavaScript files, so you need to force a refresh:

- **Chrome/Edge**: Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- **Firefox**: Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- **Safari**: Press `Cmd+Option+R`

Or manually clear your browser cache in browser settings.

### Step 5: Add to Dashboard

#### Recommended: Use Panel View (Full Width)

This card works best in a **Panel (1 card)** view where it can use the full screen width. While it works in standard Masonry layouts, the chart can feel cramped.

**To create a Panel view:**

1. **Edit your dashboard**
   - Click the **⋮** menu (top right)
   - Select **Edit Dashboard**

2. **Add a new view**
   - Click **+ Add View** tab at the top
   - Click the **⚙️** settings icon on the new view tab
   - Configure the view:
     - **Title**: "Heat Pump Timeline" (or your preferred name)
     - **Icon**: `mdi:chart-timeline-variant` (or your choice)
     - **View type**: Select **Panel (1 card)**
   - Click **Save**

3. **Add the card to the Panel view**
   - You should now be on the new Panel view
   - Click **+ Add Card** (it will fill the entire width)
   - Search for "Heat Pump Timeline" or click **Manual** and enter:

   ```yaml
   type: custom:heat-pump-timeline-card
   title: Heat Pump Performance
   power_in_entity: sensor.heat_pump_power_input
   power_out_entity: sensor.heat_pump_power_output
   ```

4. **Configure your entities**
   - Replace `sensor.heat_pump_power_input` with your actual power input sensor
   - Replace `sensor.heat_pump_power_output` with your actual power output sensor
   - Add optional entities (see Configuration Examples below)

5. **Save** the dashboard

#### Alternative: Standard Masonry View

If you prefer to use a standard Masonry layout:

1. **Edit your dashboard**
   - Click the **⋮** menu (top right)
   - Select **Edit Dashboard**

2. **Add the card**
   - Click **+ Add Card** (bottom right)
   - Search for "Heat Pump Timeline" or click **Manual**
   - Enter your configuration

**Note:** In Masonry view, consider reducing the `width` parameter to fit better:

```yaml
type: custom:heat-pump-timeline-card
title: Heat Pump Performance
width: 600  # Smaller width for Masonry layout
height: 400
power_in_entity: sensor.heat_pump_power_input
power_out_entity: sensor.heat_pump_power_output
```

## Configuration Examples

### Minimal (Required entities only)
```yaml
type: custom:heat-pump-timeline-card
title: Heat Pump Performance
power_in_entity: sensor.heat_pump_power_input
power_out_entity: sensor.heat_pump_power_output
```

### Basic (With temperatures)
```yaml
type: custom:heat-pump-timeline-card
title: Heat Pump Performance
power_in_entity: sensor.heat_pump_power_input
power_out_entity: sensor.heat_pump_power_output
flow_temp_entity: sensor.heat_pump_flow_temp
return_temp_entity: sensor.heat_pump_return_temp
outside_temp_entity: sensor.outside_temperature
inside_temp_entity: sensor.room_temperature
```

### Full Featured (All options)
```yaml
type: custom:heat-pump-timeline-card
title: Heat Pump Performance
hours: 24
width: 1000
height: 400

# Required
power_in_entity: sensor.heat_pump_power_input
power_out_entity: sensor.heat_pump_power_output

# Temperatures
flow_temp_entity: sensor.heat_pump_flow_temp
return_temp_entity: sensor.heat_pump_return_temp
outside_temp_entity: sensor.outside_temperature
inside_temp_entity: sensor.room_temperature

# Setpoints
setpoint_entity: sensor.heating_setpoint
weather_curve_setpoint_entity: sensor.weather_curve_setpoint
flow_setpoint_entity: sensor.flow_temp_setpoint

# Other sensors
flow_rate_entity: sensor.heat_pump_flow_rate
mode_entity: sensor.heat_pump_mode
immersion_entity: sensor.immersion_heater_power
```

## Troubleshooting

### Card doesn't appear in the card picker

1. **Check the resource is registered**
   - Go to Settings → Dashboards → Resources
   - Verify `/local/heat-pump-timeline-card.js` is listed

2. **Check the file exists**
   - Verify the file is in `/config/www/heat-pump-timeline-card.js`
   - Check file permissions (should be readable)

3. **Clear browser cache** (See Step 4 above)

4. **Check browser console for errors**
   - Press F12 to open Developer Tools
   - Check the Console tab for error messages

### "Custom element doesn't exist: heat-pump-timeline-card"

This means the JavaScript file isn't loading. Check:
1. Resource URL is `/local/heat-pump-timeline-card.js` (note: `/local/` maps to `/config/www/`)
2. Resource type is **JavaScript Module** (not JavaScript)
3. Browser cache is cleared
4. No JavaScript errors in browser console

### Card shows but displays "No data available"

Check that:
1. Your entity IDs are correct
2. The entities have historical data (check in Developer Tools → States)
3. The recorder integration is enabled
4. The entities have been recording for at least a few minutes

### Power values show as "0" or incorrect

The card auto-detects units (W or kW) from your sensors. Check:
1. Your power sensors have the correct unit of measurement
2. The values in Developer Tools look correct
3. Try adding more entities to verify the data is being fetched

## Updating the Card

To update to a newer version:

1. Download the new `heat-pump-timeline-card.js` file
2. Replace the old file in `/config/www/`
3. **Clear your browser cache** (very important!)
4. Hard refresh your browser (Ctrl+Shift+R)

## Getting Help

If you encounter issues:

1. Check the [GitHub Issues](https://github.com/matban666/heat-pump-timeline-card/issues)
2. Open a new issue with:
   - Your Home Assistant version
   - Browser and version
   - Error messages from browser console
   - Your card configuration (remove sensitive data)
   - Description of what's not working

## Next Steps

- See [README.md](README.md) for full feature documentation
- Check [CHANGELOG.md](CHANGELOG.md) for version history
- Add screenshots of your card to share with others!
