class HeatPumpTimelineCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._loading = true;
    this._zoomSelection = null; // { startX, currentX }
    this._isSelecting = false;
    this._customTimeRange = null; // { startTime, endTime }
    this._hiddenLines = new Set(); // Track which lines are hidden
  }

  setConfig(config) {
    if (!config.power_in_entity) {
      throw new Error('You need to define power_in_entity');
    }
    if (!config.power_out_entity) {
      throw new Error('You need to define power_out_entity');
    }

    this.config = {
      ...config,
      hours: config.hours || 1,
      title: config.title || 'Heat Pump Timeline',
      width: config.width || 1000,
      height: config.height || 400,
      // Required entities
      power_in_entity: config.power_in_entity,
      power_out_entity: config.power_out_entity,
      // Optional entities
      flow_temp_entity: config.flow_temp_entity,
      return_temp_entity: config.return_temp_entity,
      outside_temp_entity: config.outside_temp_entity,
      inside_temp_entity: config.inside_temp_entity,
      setpoint_entity: config.setpoint_entity,
      weather_curve_setpoint_entity: config.weather_curve_setpoint_entity,
      flow_setpoint_entity: config.flow_setpoint_entity,
      flow_rate_entity: config.flow_rate_entity,
      mode_entity: config.mode_entity,
      immersion_entity: config.immersion_entity,
    };

    // Fetch data if hass is already available (e.g., during edit)
    if (this._hass) {
      this.fetchData();
    } else {
      // Show loading state while waiting for hass
      this.render();
    }
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;

    // If this is the first time hass is set and we have a config, fetch data
    if (!oldHass && this.config) {
      this.fetchData();
    }
  }

  async fetchData() {
    if (!this._hass) return;

    this._loading = true;
    this.render();

    try {
      // Use custom time range if set, otherwise use hours-based range
      let endTime, startTime;
      if (this._customTimeRange) {
        startTime = new Date(this._customTimeRange.startTime);
        endTime = new Date(this._customTimeRange.endTime);
      } else {
        endTime = new Date();
        startTime = new Date(endTime.getTime() - this.config.hours * 60 * 60 * 1000);
      }

      // Collect all entities to fetch
      const entitiesToFetch = [
        this.config.power_in_entity,
        this.config.power_out_entity,
        this.config.flow_temp_entity,
        this.config.return_temp_entity,
        this.config.outside_temp_entity,
        this.config.inside_temp_entity,
        this.config.setpoint_entity,
        this.config.weather_curve_setpoint_entity,
        this.config.flow_setpoint_entity,
        this.config.flow_rate_entity,
        this.config.mode_entity,
        this.config.immersion_entity,
      ].filter(e => e);

      // Get current states to check units
      const powerInState = this._hass.states[this.config.power_in_entity];
      const powerOutState = this._hass.states[this.config.power_out_entity];
      const immersionState = this.config.immersion_entity ? this._hass.states[this.config.immersion_entity] : null;

      // Detect units and create conversion factors (convert to W if needed)
      this._powerInFactor = this.getPowerConversionFactor(powerInState);
      this._powerOutFactor = this.getPowerConversionFactor(powerOutState);
      this._immersionFactor = immersionState ? this.getPowerConversionFactor(immersionState) : 1;

      console.log('Power conversion factors:', {
        power_in: this._powerInFactor,
        power_out: this._powerOutFactor,
        immersion: this._immersionFactor
      });

      // Fetch history for all entities
      const historyPromises = entitiesToFetch.map(entityId =>
        this._hass.callApi('GET', `history/period/${startTime.toISOString()}?filter_entity_id=${entityId}&end_time=${endTime.toISOString()}`)
      );

      const historyResults = await Promise.all(historyPromises);

      // Parse history into data structure with unit conversion
      const power_in = this.parseHistory(historyResults[0], this._powerInFactor);
      const power_out = this.parseHistory(historyResults[1], this._powerOutFactor);
      const flow_temp = this.config.flow_temp_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.flow_temp_entity)]) : [];
      const return_temp = this.config.return_temp_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.return_temp_entity)]) : [];
      const outside_temp = this.config.outside_temp_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.outside_temp_entity)]) : [];
      const inside_temp = this.config.inside_temp_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.inside_temp_entity)]) : [];
      const setpoint = this.config.setpoint_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.setpoint_entity)]) : [];
      const weather_curve_setpoint = this.config.weather_curve_setpoint_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.weather_curve_setpoint_entity)]) : [];
      const flow_setpoint = this.config.flow_setpoint_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.flow_setpoint_entity)]) : [];
      const flow_rate = this.config.flow_rate_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.flow_rate_entity)]) : [];
      const mode = this.config.mode_entity ? this.parseModeHistory(historyResults[entitiesToFetch.indexOf(this.config.mode_entity)]) : [];
      const immersion = this.config.immersion_entity ? this.parseHistory(historyResults[entitiesToFetch.indexOf(this.config.immersion_entity)], this._immersionFactor) : [];

      // Extend temperature lines to the end of the time window with last known values
      this._data = {
        power_in,
        power_out,
        flow_temp: this.extendToEndTime(flow_temp, endTime),
        return_temp: this.extendToEndTime(return_temp, endTime),
        outside_temp: this.extendToEndTime(outside_temp, endTime),
        inside_temp: this.extendToEndTime(inside_temp, endTime),
        setpoint: this.extendToEndTime(setpoint, endTime),
        weather_curve_setpoint: this.extendToEndTime(weather_curve_setpoint, endTime),
        flow_setpoint: this.extendToEndTime(flow_setpoint, endTime),
        flow_rate: this.extendToEndTime(flow_rate, endTime),
        mode,
        immersion,
        startTime,
        endTime,
      };

      console.log('Fetched history data:', this._data);

      this._loading = false;
      this.render();
    } catch (error) {
      console.error('Failed to fetch history data:', error);
      this._loading = false;
      this._error = error.message;
      this.render();
    }
  }

  getPowerConversionFactor(state) {
    if (!state || !state.attributes) {
      console.warn(`No state or attributes found, assuming watts`);
      return 1;
    }

    const unit = state.attributes.unit_of_measurement;
    if (!unit) {
      console.warn(`No unit found for ${state.entity_id}, assuming watts`);
      return 1;
    }

    // Normalize unit string
    const normalizedUnit = unit.toLowerCase().trim();

    // If it's already in Watts, no conversion needed
    if (normalizedUnit === 'w' || normalizedUnit === 'watts') {
      console.log(`${state.entity_id}: detected unit="${unit}", using watts (no conversion)`);
      return 1;
    }

    // If it's in kilowatts, convert to watts
    if (normalizedUnit === 'kw' || normalizedUnit === 'kilowatts') {
      console.log(`${state.entity_id}: detected unit="${unit}", converting kW to W (×1000)`);
      return 1000;
    }

    // Default: assume watts
    console.warn(`Unknown power unit "${unit}" for ${state.entity_id}, assuming watts`);
    return 1;
  }

  parseHistory(historyData, conversionFactor = 1) {
    if (!historyData || historyData.length === 0) return [];

    const entityHistory = historyData[0];
    if (!entityHistory) return [];

    // Use last_updated instead of last_changed to get all data points
    // This ensures we have data even if the value hasn't changed
    const dataPoints = entityHistory.map(state => ({
      time: new Date(state.last_updated || state.last_changed),
      value: this.parseValue(state.state, conversionFactor),
      state: state.state,
    })).filter(point => !isNaN(point.value) && point.value !== null);

    // Sort by time to ensure chronological order
    dataPoints.sort((a, b) => a.time - b.time);

    return dataPoints;
  }

  parseModeHistory(historyData) {
    if (!historyData || historyData.length === 0) return [];

    const entityHistory = historyData[0];
    if (!entityHistory) return [];

    // For mode data, we keep the string states without trying to convert to numbers
    const dataPoints = entityHistory.map(state => ({
      time: new Date(state.last_updated || state.last_changed),
      state: state.state,
    })).filter(point => point.state && point.state !== 'unknown' && point.state !== 'unavailable');

    // Sort by time to ensure chronological order
    dataPoints.sort((a, b) => a.time - b.time);

    return dataPoints;
  }

  parseValue(value, conversionFactor = 1) {
    if (value === 'unknown' || value === 'unavailable') return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed * conversionFactor;
  }

  extendToEndTime(dataPoints, endTime) {
    if (dataPoints.length === 0) return dataPoints;

    // Get the last data point
    const lastPoint = dataPoints[dataPoints.length - 1];

    // If the last point is before the end time, add a point at end time with the same value
    if (lastPoint.time < endTime) {
      return [
        ...dataPoints,
        {
          time: endTime,
          value: lastPoint.value,
          state: lastPoint.state,
        }
      ];
    }

    return dataPoints;
  }

  render() {
    if (this._loading) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding: 16px; text-align: center;">
            <div style="margin-bottom: 8px;">Loading history data...</div>
            <div style="font-size: 12px; color: var(--secondary-text-color);">
              Querying ${this.config.hours} hour(s) of history
            </div>
          </div>
        </ha-card>
      `;
      return;
    }

    if (this._error) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          ${this.renderControls()}
          <div style="padding: 16px; color: var(--error-color);">
            <strong>Error:</strong> ${this._error}
          </div>
        </ha-card>
      `;
      return;
    }

    if (!this._data) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          ${this.renderControls()}
          <div style="padding: 16px;">
            No data available.
          </div>
        </ha-card>
      `;
      return;
    }

    this.renderChart(this._data);
  }

  renderControls() {
    const timeRanges = [
      { label: 'H', value: 1 },
      { label: '6', value: 6 },
      { label: 'D', value: 24 },
      { label: 'W', value: 168 },
      // { label: 'M', value: 720 }, // Commented out - choppy performance
    ];

    // Check if we're in custom time range mode
    const isCustomRange = this._customTimeRange !== null;

    // Format the time boundaries if we have data
    let timeBoundariesHTML = '';
    if (this._data) {
      const startStr = this._data.startTime.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      const endStr = this._data.endTime.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      timeBoundariesHTML = `
        <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 8px;">
          <strong>Time Window:</strong> ${startStr} → ${endStr}
        </div>
      `;
    }

    return `
      <div style="padding: 12px 16px; background: var(--secondary-background-color); border-bottom: 1px solid var(--divider-color);">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <div style="display: flex; gap: 4px;">
            <button class="nav-btn" data-shift="-1" style="padding: 6px 10px; background: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; cursor: pointer; font-weight: 500;">&lt;&lt;</button>
            <button class="nav-btn" data-shift="-0.25" style="padding: 6px 10px; background: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; cursor: pointer; font-weight: 500;">&lt;</button>
            <button class="nav-btn" data-shift="0.25" style="padding: 6px 10px; background: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; cursor: pointer; font-weight: 500;">&gt;</button>
            <button class="nav-btn" data-shift="1" style="padding: 6px 10px; background: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; cursor: pointer; font-weight: 500;">&gt;&gt;</button>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="zoom-btn" data-zoom="0.5" style="padding: 6px 10px; background: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; cursor: pointer; font-weight: 500;">+</button>
            <button class="zoom-btn" data-zoom="2" style="padding: 6px 10px; background: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; cursor: pointer; font-weight: 500;">-</button>
          </div>
          <div style="font-weight: 500;">Time Range:</div>
          ${timeRanges.map(range => `
            <button
              class="time-range-btn"
              data-hours="${range.value}"
              style="
                padding: 6px 12px;
                background: ${!isCustomRange && this.config.hours === range.value ? 'var(--primary-color)' : 'var(--card-background-color)'};
                color: ${!isCustomRange && this.config.hours === range.value ? 'var(--text-primary-color)' : 'var(--primary-text-color)'};
                border: 1px solid var(--divider-color);
                border-radius: 4px;
                cursor: pointer;
                font-weight: ${!isCustomRange && this.config.hours === range.value ? '600' : '400'};
              ">
              ${range.label}
            </button>
          `).join('')}
          <button class="refresh-button" style="padding: 6px 12px; background: var(--primary-color); color: var(--text-primary-color); border: none; border-radius: 4px; cursor: pointer; font-weight: 500; margin-left: auto;">
            Refresh
          </button>
        </div>
        ${timeBoundariesHTML}
      </div>
    `;
  }

  setupControlListeners() {
    const timeRangeBtns = this.shadowRoot.querySelectorAll('.time-range-btn');
    timeRangeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hours = parseInt(e.target.dataset.hours);
        this.config.hours = hours;
        // Clear custom time range when preset button is clicked
        this._customTimeRange = null;
        this.fetchData();
      });
    });

    const refreshButton = this.shadowRoot.querySelector('.refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        this.fetchData();
      });
    }

    // Navigation buttons
    const navBtns = this.shadowRoot.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const shiftFraction = parseFloat(e.target.dataset.shift);
        this.shiftTimeWindow(shiftFraction);
      });
    });

    // Zoom buttons
    const zoomBtns = this.shadowRoot.querySelectorAll('.zoom-btn');
    zoomBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const zoomFactor = parseFloat(e.target.dataset.zoom);
        this.zoomTimeWindow(zoomFactor);
      });
    });
  }

  shiftTimeWindow(shiftFraction) {
    // Get current time window
    let currentStart, currentEnd;
    if (this._customTimeRange) {
      currentStart = new Date(this._customTimeRange.startTime);
      currentEnd = new Date(this._customTimeRange.endTime);
    } else {
      currentEnd = new Date();
      currentStart = new Date(currentEnd.getTime() - this.config.hours * 60 * 60 * 1000);
    }

    // Calculate window width in milliseconds
    const windowWidth = currentEnd.getTime() - currentStart.getTime();

    // Calculate shift amount (fraction of window width)
    const shiftAmount = windowWidth * shiftFraction;

    // Calculate new time range
    const newStart = new Date(currentStart.getTime() + shiftAmount);
    const newEnd = new Date(currentEnd.getTime() + shiftAmount);

    // Set custom time range and fetch data
    this._customTimeRange = {
      startTime: newStart,
      endTime: newEnd
    };

    this.fetchData();
  }

  zoomTimeWindow(zoomFactor) {
    // Get current time window
    let currentStart, currentEnd;
    if (this._customTimeRange) {
      currentStart = new Date(this._customTimeRange.startTime);
      currentEnd = new Date(this._customTimeRange.endTime);
    } else {
      currentEnd = new Date();
      currentStart = new Date(currentEnd.getTime() - this.config.hours * 60 * 60 * 1000);
    }

    // Calculate current window center
    const currentCenter = (currentStart.getTime() + currentEnd.getTime()) / 2;

    // Calculate current window width
    const currentWidth = currentEnd.getTime() - currentStart.getTime();

    // Calculate new window width
    const newWidth = currentWidth * zoomFactor;

    // Calculate new start and end times, centered on the same point
    const newStart = new Date(currentCenter - newWidth / 2);
    const newEnd = new Date(currentCenter + newWidth / 2);

    // Set custom time range and fetch data
    this._customTimeRange = {
      startTime: newStart,
      endTime: newEnd
    };

    this.fetchData();
  }

  setupLegendListeners() {
    const legendItems = this.shadowRoot.querySelectorAll('.legend-item');
    legendItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const label = item.getAttribute('data-label');
        if (!label) return;

        // Toggle visibility
        if (this._hiddenLines.has(label)) {
          this._hiddenLines.delete(label);
        } else {
          this._hiddenLines.add(label);
        }

        // Re-render chart with current data
        if (this._data) {
          this.renderChart(this._data);
        }
      });
    });
  }

  setupDHWTooltips() {
    const tooltip = this.shadowRoot.querySelector('.tooltip');
    const dhwPeriods = this.shadowRoot.querySelectorAll('.dhw-period');

    dhwPeriods.forEach(rect => {
      const startStr = rect.getAttribute('data-start');
      const endStr = rect.getAttribute('data-end');
      const durationMs = parseInt(rect.getAttribute('data-duration'));

      const startTime = new Date(startStr);
      const endTime = new Date(endStr);

      rect.addEventListener('mouseenter', () => {
        tooltip.classList.add('visible');
      });

      rect.addEventListener('mousemove', (e) => {
        const containerRect = this.shadowRoot.querySelector('.chart-container').getBoundingClientRect();

        // Format times
        const startTimeStr = startTime.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        const endTimeStr = endTime.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // Calculate duration
        const durationMinutes = Math.floor(durationMs / 60000);
        const durationHours = Math.floor(durationMinutes / 60);
        const remainingMinutes = durationMinutes % 60;
        const durationStr = durationHours > 0
          ? `${durationHours}h ${remainingMinutes}m`
          : `${durationMinutes}m`;

        // Show tooltip
        tooltip.innerHTML = `
          <div style="color: #e67e22; font-weight: bold; margin-bottom: 4px;">DHW Mode</div>
          <div style="font-size: 12px;">Start: ${startTimeStr}</div>
          <div style="font-size: 12px;">End: ${endTimeStr}</div>
          <div style="font-size: 12px; color: #3498db; font-weight: bold; margin-top: 2px;">Duration: ${durationStr}</div>
        `;

        // Position tooltip
        tooltip.style.left = (e.clientX - containerRect.left + 15) + 'px';
        tooltip.style.top = (e.clientY - containerRect.top - 15) + 'px';
      });

      rect.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });
    });
  }

  setupLineTooltips(data, scaleX, scaleY, timeExtent) {
    const tooltip = this.shadowRoot.querySelector('.tooltip');
    const svg = this.shadowRoot.querySelector('svg');
    const hoverPaths = this.shadowRoot.querySelectorAll('.line-hover');
    const hoverAreas = this.shadowRoot.querySelectorAll('.area-hover');

    // Map of labels to data
    const dataMap = {
      'Flow Temp': data.flow_temp,
      'Return Temp': data.return_temp,
      'Outside Temp': data.outside_temp,
      'Room Temp': data.inside_temp,
      'Setpoint': data.setpoint,
      'Weather Curve Setpoint': data.weather_curve_setpoint,
      'Flow Setpoint': data.flow_setpoint,
      'Flow Rate': data.flow_rate,
      'Heat Output': data.power_out,
      'Electricity In': data.power_in,
    };

    // Handle temperature lines
    hoverPaths.forEach(path => {
      const label = path.getAttribute('data-label');
      const color = path.getAttribute('data-color');
      const lineId = path.getAttribute('data-line-id');
      const dataPoints = dataMap[label];

      if (!dataPoints || dataPoints.length === 0) return;

      // Find the corresponding visible line
      const visibleLine = this.shadowRoot.querySelector(`.line-visible[data-line-id="${lineId}"]`);

      path.addEventListener('mouseenter', () => {
        tooltip.classList.add('visible');
        // Embiggen the line on hover
        if (visibleLine) {
          visibleLine.setAttribute('stroke-width', '3');
        }
      });

      path.addEventListener('mousemove', (e) => {
        const svgRect = svg.getBoundingClientRect();
        const containerRect = this.shadowRoot.querySelector('.chart-container').getBoundingClientRect();

        // Get mouse position relative to SVG
        const mouseX = e.clientX - svgRect.left;

        // Convert mouse X to time
        const padding = { left: 60, right: 60 };
        const chartWidth = svgRect.width - padding.left - padding.right;
        const timeRatio = (mouseX - padding.left) / chartWidth;
        const mouseTime = timeExtent[0] + (timeRatio * (timeExtent[1] - timeExtent[0]));

        // Find nearest data point
        let nearestPoint = dataPoints[0];
        let minDistance = Math.abs(dataPoints[0].time.getTime() - mouseTime);

        for (let i = 1; i < dataPoints.length; i++) {
          const distance = Math.abs(dataPoints[i].time.getTime() - mouseTime);
          if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = dataPoints[i];
          }
        }

        // Format time
        const timeStr = nearestPoint.time.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // Special handling for Flow/Return temps - show both + Delta-T + Overshoot
        if (label === 'Flow Temp' || label === 'Return Temp') {
          const flowData = dataMap['Flow Temp'];
          const returnData = dataMap['Return Temp'];
          const flowSetpointData = dataMap['Flow Setpoint'];

          // Find nearest points for flow, return, and flow setpoint at this time
          let flowPoint = null;
          let returnPoint = null;
          let flowSetpointPoint = null;

          if (flowData && flowData.length > 0) {
            flowPoint = flowData[0];
            let minFlowDist = Math.abs(flowData[0].time.getTime() - mouseTime);
            for (let i = 1; i < flowData.length; i++) {
              const distance = Math.abs(flowData[i].time.getTime() - mouseTime);
              if (distance < minFlowDist) {
                minFlowDist = distance;
                flowPoint = flowData[i];
              }
            }
          }

          if (returnData && returnData.length > 0) {
            returnPoint = returnData[0];
            let minReturnDist = Math.abs(returnData[0].time.getTime() - mouseTime);
            for (let i = 1; i < returnData.length; i++) {
              const distance = Math.abs(returnData[i].time.getTime() - mouseTime);
              if (distance < minReturnDist) {
                minReturnDist = distance;
                returnPoint = returnData[i];
              }
            }
          }

          if (flowSetpointData && flowSetpointData.length > 0) {
            flowSetpointPoint = flowSetpointData[0];
            let minFlowSetpointDist = Math.abs(flowSetpointData[0].time.getTime() - mouseTime);
            for (let i = 1; i < flowSetpointData.length; i++) {
              const distance = Math.abs(flowSetpointData[i].time.getTime() - mouseTime);
              if (distance < minFlowSetpointDist) {
                minFlowSetpointDist = distance;
                flowSetpointPoint = flowSetpointData[i];
              }
            }
          }

          // Calculate Delta-T and Overshoot if we have the values
          let tooltipContent = '';
          if (flowPoint && returnPoint && flowSetpointPoint) {
            const deltaT = flowPoint.value - returnPoint.value;
            const overshoot = flowPoint.value - flowSetpointPoint.value;
            tooltipContent = `
              <div style="color: #e74c3c; font-weight: bold;">Flow: ${flowPoint.value.toFixed(1)}°C</div>
              <div style="color: #2ecc71; font-weight: bold;">Return: ${returnPoint.value.toFixed(1)}°C</div>
              <div style="color: #f39c12; font-weight: bold; margin-top: 2px;">ΔT: ${deltaT.toFixed(1)}°C</div>
              <div style="color: #9b59b6; font-weight: bold;">Overshoot: ${overshoot.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (flowPoint && returnPoint) {
            const deltaT = flowPoint.value - returnPoint.value;
            tooltipContent = `
              <div style="color: #e74c3c; font-weight: bold;">Flow: ${flowPoint.value.toFixed(1)}°C</div>
              <div style="color: #2ecc71; font-weight: bold;">Return: ${returnPoint.value.toFixed(1)}°C</div>
              <div style="color: #f39c12; font-weight: bold; margin-top: 2px;">ΔT: ${deltaT.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (flowPoint) {
            tooltipContent = `
              <div style="color: #e74c3c; font-weight: bold;">Flow: ${flowPoint.value.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (returnPoint) {
            tooltipContent = `
              <div style="color: #2ecc71; font-weight: bold;">Return: ${returnPoint.value.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          }

          tooltip.innerHTML = tooltipContent;
        } else if (label === 'Weather Curve Setpoint' || label === 'Flow Setpoint') {
          // Special handling for Weather Curve Setpoint / Flow Setpoint - show both + Modulation
          const weatherCurveData = dataMap['Weather Curve Setpoint'];
          const flowSetpointData = dataMap['Flow Setpoint'];

          // Find nearest points for both setpoints at this time
          let weatherCurvePoint = null;
          let flowSetpointPoint = null;

          if (weatherCurveData && weatherCurveData.length > 0) {
            weatherCurvePoint = weatherCurveData[0];
            let minWeatherCurveDist = Math.abs(weatherCurveData[0].time.getTime() - mouseTime);
            for (let i = 1; i < weatherCurveData.length; i++) {
              const distance = Math.abs(weatherCurveData[i].time.getTime() - mouseTime);
              if (distance < minWeatherCurveDist) {
                minWeatherCurveDist = distance;
                weatherCurvePoint = weatherCurveData[i];
              }
            }
          }

          if (flowSetpointData && flowSetpointData.length > 0) {
            flowSetpointPoint = flowSetpointData[0];
            let minFlowSetpointDist = Math.abs(flowSetpointData[0].time.getTime() - mouseTime);
            for (let i = 1; i < flowSetpointData.length; i++) {
              const distance = Math.abs(flowSetpointData[i].time.getTime() - mouseTime);
              if (distance < minFlowSetpointDist) {
                minFlowSetpointDist = distance;
                flowSetpointPoint = flowSetpointData[i];
              }
            }
          }

          // Calculate Modulation if we have both values
          let tooltipContent = '';
          if (weatherCurvePoint && flowSetpointPoint) {
            const modulation = flowSetpointPoint.value - weatherCurvePoint.value;
            tooltipContent = `
              <div style="color: #16a085; font-weight: bold;">Weather Curve: ${weatherCurvePoint.value.toFixed(1)}°C</div>
              <div style="color: #e67e22; font-weight: bold;">Flow Setpoint: ${flowSetpointPoint.value.toFixed(1)}°C</div>
              <div style="color: #3498db; font-weight: bold; margin-top: 2px;">Modulation: ${modulation.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (weatherCurvePoint) {
            tooltipContent = `
              <div style="color: #16a085; font-weight: bold;">Weather Curve: ${weatherCurvePoint.value.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (flowSetpointPoint) {
            tooltipContent = `
              <div style="color: #e67e22; font-weight: bold;">Flow Setpoint: ${flowSetpointPoint.value.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          }

          tooltip.innerHTML = tooltipContent;
        } else if (label === 'Setpoint' || label === 'Room Temp') {
          // Special handling for Setpoint / Room Temp - show both + Overshoot
          const setpointData = dataMap['Setpoint'];
          const roomTempData = dataMap['Room Temp'];

          // Find nearest points for both setpoint and room temp at this time
          let setpointPoint = null;
          let roomTempPoint = null;

          if (setpointData && setpointData.length > 0) {
            setpointPoint = setpointData[0];
            let minSetpointDist = Math.abs(setpointData[0].time.getTime() - mouseTime);
            for (let i = 1; i < setpointData.length; i++) {
              const distance = Math.abs(setpointData[i].time.getTime() - mouseTime);
              if (distance < minSetpointDist) {
                minSetpointDist = distance;
                setpointPoint = setpointData[i];
              }
            }
          }

          if (roomTempData && roomTempData.length > 0) {
            roomTempPoint = roomTempData[0];
            let minRoomTempDist = Math.abs(roomTempData[0].time.getTime() - mouseTime);
            for (let i = 1; i < roomTempData.length; i++) {
              const distance = Math.abs(roomTempData[i].time.getTime() - mouseTime);
              if (distance < minRoomTempDist) {
                minRoomTempDist = distance;
                roomTempPoint = roomTempData[i];
              }
            }
          }

          // Calculate Overshoot if we have both values
          let tooltipContent = '';
          if (setpointPoint && roomTempPoint) {
            const overshoot = roomTempPoint.value - setpointPoint.value;
            tooltipContent = `
              <div style="color: #34495e; font-weight: bold;">Room Temp: ${roomTempPoint.value.toFixed(1)}°C</div>
              <div style="color: #95a5a6; font-weight: bold;">Setpoint: ${setpointPoint.value.toFixed(1)}°C</div>
              <div style="color: #e74c3c; font-weight: bold; margin-top: 2px;">Overshoot: ${overshoot.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (setpointPoint) {
            tooltipContent = `
              <div style="color: #95a5a6; font-weight: bold;">Setpoint: ${setpointPoint.value.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (roomTempPoint) {
            tooltipContent = `
              <div style="color: #34495e; font-weight: bold;">Room Temp: ${roomTempPoint.value.toFixed(1)}°C</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          }

          tooltip.innerHTML = tooltipContent;
        } else if (label === 'Flow Rate') {
          // Special handling for Flow Rate - show in l/min
          tooltip.innerHTML = `
            <div style="color: ${color}; font-weight: bold; margin-bottom: 2px;">${label}</div>
            <div>${nearestPoint.value.toFixed(1)} l/min</div>
            <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
          `;
        } else {
          // Show tooltip for other temperature lines (normal behavior)
          tooltip.innerHTML = `
            <div style="color: ${color}; font-weight: bold; margin-bottom: 2px;">${label}</div>
            <div>${nearestPoint.value.toFixed(1)}°C</div>
            <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
          `;
        }

        // Position tooltip
        tooltip.style.left = (e.clientX - containerRect.left + 15) + 'px';
        tooltip.style.top = (e.clientY - containerRect.top - 15) + 'px';
      });

      path.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
        // Reset the line width
        if (visibleLine) {
          visibleLine.setAttribute('stroke-width', '1.5');
        }
      });
    });

    // Handle power areas
    hoverAreas.forEach(area => {
      const label = area.getAttribute('data-label');
      const color = area.getAttribute('data-color');
      const dataPoints = dataMap[label];

      if (!dataPoints || dataPoints.length === 0) return;

      area.addEventListener('mouseenter', () => {
        tooltip.classList.add('visible');
      });

      area.addEventListener('mousemove', (e) => {
        const svgRect = svg.getBoundingClientRect();
        const containerRect = this.shadowRoot.querySelector('.chart-container').getBoundingClientRect();

        // Get mouse position relative to SVG
        const mouseX = e.clientX - svgRect.left;

        // Convert mouse X to time
        const padding = { left: 60, right: 60 };
        const chartWidth = svgRect.width - padding.left - padding.right;
        const timeRatio = (mouseX - padding.left) / chartWidth;
        const mouseTime = timeExtent[0] + (timeRatio * (timeExtent[1] - timeExtent[0]));

        // Find nearest data point
        let nearestPoint = dataPoints[0];
        let minDistance = Math.abs(dataPoints[0].time.getTime() - mouseTime);

        for (let i = 1; i < dataPoints.length; i++) {
          const distance = Math.abs(dataPoints[i].time.getTime() - mouseTime);
          if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = dataPoints[i];
          }
        }

        // Format time
        const timeStr = nearestPoint.time.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // Special handling for power - show both Electricity In and Heat Output + COP
        if (label === 'Heat Output' || label === 'Electricity In') {
          const powerInData = dataMap['Electricity In'];
          const powerOutData = dataMap['Heat Output'];

          // Find nearest points for both power in and power out at this time
          let powerInPoint = null;
          let powerOutPoint = null;

          if (powerInData && powerInData.length > 0) {
            powerInPoint = powerInData[0];
            let minPowerInDist = Math.abs(powerInData[0].time.getTime() - mouseTime);
            for (let i = 1; i < powerInData.length; i++) {
              const distance = Math.abs(powerInData[i].time.getTime() - mouseTime);
              if (distance < minPowerInDist) {
                minPowerInDist = distance;
                powerInPoint = powerInData[i];
              }
            }
          }

          if (powerOutData && powerOutData.length > 0) {
            powerOutPoint = powerOutData[0];
            let minPowerOutDist = Math.abs(powerOutData[0].time.getTime() - mouseTime);
            for (let i = 1; i < powerOutData.length; i++) {
              const distance = Math.abs(powerOutData[i].time.getTime() - mouseTime);
              if (distance < minPowerOutDist) {
                minPowerOutDist = distance;
                powerOutPoint = powerOutData[i];
              }
            }
          }

          // Helper function to format power values
          const formatPower = (value) => {
            if (value >= 1000) {
              return `${(value / 1000).toFixed(2)} kW`;
            } else {
              return `${value.toFixed(0)} W`;
            }
          };

          // Calculate COP if we have both values
          let tooltipContent = '';
          if (powerInPoint && powerOutPoint) {
            const cop = powerInPoint.value > 0 ? (powerOutPoint.value / powerInPoint.value) : 0;
            tooltipContent = `
              <div style="color: rgba(241, 196, 15, 1); font-weight: bold;">Heat Output: ${formatPower(powerOutPoint.value)}</div>
              <div style="color: rgba(52, 152, 219, 1); font-weight: bold;">Electricity In: ${formatPower(powerInPoint.value)}</div>
              <div style="color: #37db34ff; font-weight: bold; margin-top: 2px;">COP: ${cop.toFixed(2)}</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (powerInPoint) {
            tooltipContent = `
              <div style="color: rgba(52, 152, 219, 1); font-weight: bold;">Electricity In: ${formatPower(powerInPoint.value)}</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          } else if (powerOutPoint) {
            tooltipContent = `
              <div style="color: rgba(241, 196, 15, 1); font-weight: bold;">Heat Output: ${formatPower(powerOutPoint.value)}</div>
              <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
            `;
          }

          tooltip.innerHTML = tooltipContent;
        } else {
          // Format power value (convert W to kW if > 1000) for other power metrics
          let powerStr;
          if (nearestPoint.value >= 1000) {
            powerStr = `${(nearestPoint.value / 1000).toFixed(2)} kW`;
          } else {
            powerStr = `${nearestPoint.value.toFixed(0)} W`;
          }

          // Show tooltip
          tooltip.innerHTML = `
            <div style="color: ${color}; font-weight: bold; margin-bottom: 2px;">${label}</div>
            <div>${powerStr}</div>
            <div style="font-size: 11px; color: #ccc; margin-top: 2px;">${timeStr}</div>
          `;
        }

        // Position tooltip
        tooltip.style.left = (e.clientX - containerRect.left + 15) + 'px';
        tooltip.style.top = (e.clientY - containerRect.top - 15) + 'px';
      });

      area.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });
    });
  }

  setupZoomSelection(data, scaleX, padding, configWidth) {
    const svg = this.shadowRoot.querySelector('svg');
    const chartContainer = this.shadowRoot.querySelector('.chart-container');
    const zoomSelection = this.shadowRoot.querySelector('.zoom-selection');

    let isSelecting = false;
    let startX = 0;

    const getChartX = (clientX) => {
      const svgRect = svg.getBoundingClientRect();
      const relativeX = clientX - svgRect.left;

      // Calculate actual rendered padding based on SVG scale
      const svgWidth = svgRect.width;
      const scale = svgWidth / configWidth;
      const scaledPaddingLeft = padding.left * scale;
      const scaledPaddingRight = padding.right * scale;

      // Clamp to chart area (within scaled padding)
      const chartLeft = scaledPaddingLeft;
      const chartRight = svgWidth - scaledPaddingRight;
      return Math.max(chartLeft, Math.min(chartRight, relativeX));
    };

    const handleMouseDown = (e) => {
      // Only start selection if clicking in the chart area (not on tooltips, etc.)
      if (e.target.tagName !== 'svg' && !e.target.closest('svg')) return;

      isSelecting = true;
      startX = getChartX(e.clientX);

      const svgRect = svg.getBoundingClientRect();
      const scale = svgRect.width / configWidth;
      const scaledPaddingTop = padding.top * scale;
      const scaledPaddingBottom = padding.bottom * scale;

      zoomSelection.classList.add('active');
      zoomSelection.style.left = startX + 'px';
      zoomSelection.style.top = scaledPaddingTop + 'px';
      zoomSelection.style.width = '0px';
      zoomSelection.style.height = (svgRect.height - scaledPaddingTop - scaledPaddingBottom) + 'px';
    };

    const handleMouseMove = (e) => {
      if (!isSelecting) return;

      const currentX = getChartX(e.clientX);
      const left = Math.min(startX, currentX);
      const selectionWidth = Math.abs(currentX - startX);

      zoomSelection.style.left = left + 'px';
      zoomSelection.style.width = selectionWidth + 'px';
    };

    const handleMouseUp = (e) => {
      if (!isSelecting) return;

      isSelecting = false;
      const endX = getChartX(e.clientX);

      // Only zoom if there's a meaningful selection (at least 10 pixels)
      if (Math.abs(endX - startX) < 10) {
        zoomSelection.classList.remove('active');
        return;
      }

      // Calculate the time range from the selection using actual rendered dimensions
      const svgRect = svg.getBoundingClientRect();
      const scale = svgRect.width / configWidth;
      const scaledPaddingLeft = padding.left * scale;
      const scaledPaddingRight = padding.right * scale;
      const chartWidth = svgRect.width - scaledPaddingLeft - scaledPaddingRight;
      const timeExtent = [data.startTime.getTime(), data.endTime.getTime()];

      // Convert pixel positions to time (relative to chart area, not including padding)
      const x1 = Math.min(startX, endX) - scaledPaddingLeft;
      const x2 = Math.max(startX, endX) - scaledPaddingLeft;

      const timeStart = new Date(timeExtent[0] + (x1 / chartWidth) * (timeExtent[1] - timeExtent[0]));
      const timeEnd = new Date(timeExtent[0] + (x2 / chartWidth) * (timeExtent[1] - timeExtent[0]));

      // Set custom time range and fetch new data
      this._customTimeRange = {
        startTime: timeStart,
        endTime: timeEnd
      };

      zoomSelection.classList.remove('active');
      this.fetchData();
    };

    const handleMouseLeave = () => {
      if (isSelecting) {
        isSelecting = false;
        zoomSelection.classList.remove('active');
      }
    };

    // Attach event listeners
    svg.addEventListener('mousedown', handleMouseDown);
    chartContainer.addEventListener('mousemove', handleMouseMove);
    chartContainer.addEventListener('mouseup', handleMouseUp);
    chartContainer.addEventListener('mouseleave', handleMouseLeave);
  }

  renderChart(data) {
    const width = this.config.width;
    const height = this.config.height;
    const padding = { top: 40, right: 60, bottom: 60, left: 60 };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate COP for the window (combined)
    const totalEnergyIn = this.calculateEnergy(data.power_in, data.startTime, data.endTime);
    const totalEnergyOut = this.calculateEnergy(data.power_out, data.startTime, data.endTime);
    const windowCOP = totalEnergyIn > 0 ? totalEnergyOut / totalEnergyIn : 0;

    // Calculate mode-specific SCOP values
    let chSCOP = 0;
    let dhwSCOP = 0;
    if (data.mode && data.mode.length > 0) {
      const chEnergyIn = this.calculateEnergyByMode(data.power_in, data.mode, 'CH');
      const chEnergyOut = this.calculateEnergyByMode(data.power_out, data.mode, 'CH');
      chSCOP = chEnergyIn > 0 ? chEnergyOut / chEnergyIn : 0;

      const dhwEnergyIn = this.calculateEnergyByMode(data.power_in, data.mode, 'DHW');
      const dhwEnergyOut = this.calculateEnergyByMode(data.power_out, data.mode, 'DHW');
      dhwSCOP = dhwEnergyIn > 0 ? dhwEnergyOut / dhwEnergyIn : 0;
    }

    // Time scale
    const timeExtent = [data.startTime.getTime(), data.endTime.getTime()];
    const scaleX = (time) => padding.left + ((time.getTime() - timeExtent[0]) / (timeExtent[1] - timeExtent[0])) * chartWidth;

    // Temperature scale (for all temperature lines and flow rate)
    const allTemps = [
      ...data.flow_temp.map(d => d.value),
      ...data.return_temp.map(d => d.value),
      ...data.outside_temp.map(d => d.value),
      ...data.inside_temp.map(d => d.value),
      ...data.setpoint.map(d => d.value),
      ...data.weather_curve_setpoint.map(d => d.value),
      ...data.flow_setpoint.map(d => d.value),
      ...data.flow_rate.map(d => d.value),
    ];
    const tempMin = Math.floor(Math.min(...allTemps, 0));
    const tempMax = Math.ceil(Math.max(...allTemps, 45));
    const scaleYTemp = (value) => height - padding.bottom - ((value - tempMin) / (tempMax - tempMin)) * chartHeight;

    // Power scale (right axis)
    const allPower = [
      ...data.power_in.map(d => d.value),
      ...data.power_out.map(d => d.value),
    ];
    const powerMax = Math.ceil(Math.max(...allPower, 7000));
    const scaleYPower = (value) => height - padding.bottom - (value / powerMax) * chartHeight;

    // Generate time axis labels
    const timeLabels = this.generateTimeLabels(data.startTime, data.endTime, this.config.hours);

    // Build SVG content
    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <!-- Grid lines -->
        ${this.renderGrid(scaleX, scaleYTemp, timeLabels, tempMin, tempMax, padding, width, height)}

        <!-- Shaded areas -->
        ${this.renderShadedAreas(data, scaleX, scaleYPower, height, padding)}

        <!-- Temperature lines -->
        ${this.renderLine(data.flow_temp, scaleX, scaleYTemp, '#e74c3c', 'Flow Temp')}
        ${this.renderLine(data.return_temp, scaleX, scaleYTemp, '#2ecc71', 'Return Temp')}
        ${this.renderLine(data.outside_temp, scaleX, scaleYTemp, '#9b59b6', 'Outside Temp')}
        ${this.renderLine(data.inside_temp, scaleX, scaleYTemp, '#34495e', 'Room Temp')}
        ${this.renderLine(data.setpoint, scaleX, scaleYTemp, '#95a5a6', 'Setpoint', '5,5')}
        ${this.renderLine(data.weather_curve_setpoint, scaleX, scaleYTemp, '#16a085', 'Weather Curve Setpoint', '5,5')}
        ${this.renderLine(data.flow_setpoint, scaleX, scaleYTemp, '#e67e22', 'Flow Setpoint', '5,5')}
        ${this.renderLine(data.flow_rate, scaleX, scaleYTemp, '#1abc9c', 'Flow Rate')}

        <!-- Axes -->
        ${this.renderAxes(scaleX, scaleYTemp, timeLabels, tempMin, tempMax, padding, width, height)}
      </svg>
    `;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 0; position: relative; }
        .chart-container-wrapper { padding: 16px; }
        .chart-title {
          text-align: center;
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 8px;
          color: var(--primary-text-color);
        }
        .chart-container { position: relative; width: 100%; }
        svg { display: block; width: 100%; height: auto; max-width: 100%; }
        .axis-label { font-size: 12px; fill: var(--secondary-text-color); }
        .axis-line { stroke: var(--divider-color); stroke-width: 1; }
        .grid-line { stroke: var(--divider-color); stroke-width: 1; opacity: 0.3; }
        .tooltip {
          position: absolute;
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 13px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          z-index: 1000;
          white-space: nowrap;
        }
        .tooltip.visible { opacity: 1; }
        .legend {
          display: flex;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
          margin-top: 12px;
          font-size: 12px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .legend-item:hover {
          opacity: 0.7;
        }
        .legend-item.hidden {
          opacity: 0.4;
          text-decoration: line-through;
        }
        .legend-color {
          width: 20px;
          height: 3px;
          border-radius: 2px;
        }
        .info-panel {
          display: flex;
          justify-content: center;
          margin-top: 12px;
          padding: 12px;
          background: var(--secondary-background-color);
          border-radius: 8px;
        }
        .info-item { text-align: center; padding: 0 20px; }
        .info-label {
          font-size: 11px;
          color: var(--secondary-text-color);
          margin-bottom: 4px;
        }
        .info-value {
          font-size: 20px;
          font-weight: bold;
          color: var(--primary-text-color);
        }
        .zoom-selection {
          position: absolute;
          background: rgba(52, 152, 219, 0.2);
          border: 2px solid rgba(52, 152, 219, 0.6);
          pointer-events: none;
          display: none;
        }
        .zoom-selection.active {
          display: block;
        }
        svg {
          cursor: crosshair;
        }
      </style>
      <ha-card>
        ${this.renderControls()}
        <div class="chart-container-wrapper">
          <div class="chart-title">${this.config.title}</div>
          <div class="chart-container">
            <div class="tooltip"></div>
            <div class="zoom-selection"></div>
            ${svg}
          </div>
          <div class="legend">
            <div class="legend-item ${this._hiddenLines.has('Flow Temp') ? 'hidden' : ''}" data-label="Flow Temp"><div class="legend-color" style="background: #e74c3c;"></div><span>Flow Temp</span></div>
            <div class="legend-item ${this._hiddenLines.has('Return Temp') ? 'hidden' : ''}" data-label="Return Temp"><div class="legend-color" style="background: #2ecc71;"></div><span>Return Temp</span></div>
            <div class="legend-item ${this._hiddenLines.has('Outside Temp') ? 'hidden' : ''}" data-label="Outside Temp"><div class="legend-color" style="background: #9b59b6;"></div><span>Outside Temp</span></div>
            <div class="legend-item ${this._hiddenLines.has('Room Temp') ? 'hidden' : ''}" data-label="Room Temp"><div class="legend-color" style="background: #34495e;"></div><span>Room Temp</span></div>
            <div class="legend-item ${this._hiddenLines.has('Setpoint') ? 'hidden' : ''}" data-label="Setpoint"><div class="legend-color" style="background: #95a5a6;"></div><span>Setpoint</span></div>
            <div class="legend-item ${this._hiddenLines.has('Weather Curve Setpoint') ? 'hidden' : ''}" data-label="Weather Curve Setpoint"><div class="legend-color" style="background: #16a085;"></div><span>Weather Curve</span></div>
            <div class="legend-item ${this._hiddenLines.has('Flow Setpoint') ? 'hidden' : ''}" data-label="Flow Setpoint"><div class="legend-color" style="background: #e67e22;"></div><span>Flow Setpoint</span></div>
            <div class="legend-item ${this._hiddenLines.has('Flow Rate') ? 'hidden' : ''}" data-label="Flow Rate"><div class="legend-color" style="background: #1abc9c;"></div><span>Flow Rate</span></div>
            <div class="legend-item ${this._hiddenLines.has('Heat Output') ? 'hidden' : ''}" data-label="Heat Output"><div class="legend-color" style="background: rgba(241, 196, 15, 0.3);"></div><span>Heat Output</span></div>
            <div class="legend-item ${this._hiddenLines.has('Electricity In') ? 'hidden' : ''}" data-label="Electricity In"><div class="legend-color" style="background: rgba(52, 152, 219, 0.3);"></div><span>Electricity In</span></div>
          </div>
          <div class="info-panel">
            <div class="info-item">
              <div class="info-label">CH SCOP</div>
              <div class="info-value">${chSCOP > 0 ? chSCOP.toFixed(2) : '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">DHW SCOP</div>
              <div class="info-value">${dhwSCOP > 0 ? dhwSCOP.toFixed(2) : '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Combined SCOP</div>
              <div class="info-value">${windowCOP.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this.setupControlListeners();
    this.setupLegendListeners();
    this.setupLineTooltips(data, scaleX, scaleYTemp, timeExtent);
    this.setupDHWTooltips();
    this.setupZoomSelection(data, scaleX, padding, width);
  }

  renderGrid(scaleX, scaleY, timeLabels, tempMin, tempMax, padding, width, height) {
    const tempTicks = this.generateTicks(tempMin, tempMax, 8);

    let gridLines = '';

    // Vertical grid lines (time)
    timeLabels.forEach(label => {
      const x = scaleX(label.time);
      gridLines += `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" class="grid-line" />`;
    });

    // Horizontal grid lines (temperature)
    tempTicks.forEach(tick => {
      const y = scaleY(tick);
      gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="grid-line" />`;
    });

    return gridLines;
  }

  renderShadedAreas(data, scaleX, scaleYPower, height, padding) {
    let areas = '';

    // DHW mode rectangles (full height, translucent)
    if (data.mode && data.mode.length > 0) {
      areas += this.renderDHWPeriods(data.mode, scaleX, height, padding);
    }

    // Heat output (yellow)
    if (data.power_out.length > 0) {
      areas += this.renderArea(data.power_out, scaleX, scaleYPower, height, padding, 'rgba(241, 196, 15, 0.3)', 'Heat Output');
    }

    // Electricity In consumption (light blue)
    if (data.power_in.length > 0) {
      areas += this.renderArea(data.power_in, scaleX, scaleYPower, height, padding, 'rgba(52, 152, 219, 0.3)', 'Electricity In');
    }

    return areas;
  }

  renderDHWPeriods(modeData, scaleX, height, padding) {
    if (modeData.length === 0) {
      return '';
    }

    let rectangles = '';
    let dhwStart = null;

    // Find DHW periods
    for (let i = 0; i < modeData.length; i++) {
      const mode = modeData[i];
      // Check if state contains 'dhw' (case insensitive)
      const isDHW = mode.state && mode.state.toLowerCase().includes('dhw');

      if (isDHW && !dhwStart) {
        // Start of a DHW period
        dhwStart = mode.time;
      } else if (!isDHW && dhwStart) {
        // End of a DHW period
        const dhwEnd = mode.time;
        rectangles += this.renderDHWRectangle(dhwStart, dhwEnd, scaleX, height, padding);
        dhwStart = null;
      }
    }

    // If still in DHW mode at the end of the data
    if (dhwStart && modeData.length > 0) {
      const dhwEnd = modeData[modeData.length - 1].time;
      rectangles += this.renderDHWRectangle(dhwStart, dhwEnd, scaleX, height, padding);
    }

    return rectangles;
  }

  renderDHWRectangle(startTime, endTime, scaleX, height, padding) {
    const x1 = scaleX(startTime);
    const x2 = scaleX(endTime);
    const width = x2 - x1;
    const rectHeight = height - padding.top - padding.bottom;

    // Create unique ID for this DHW period
    const dhwId = `dhw-${startTime.getTime()}`;

    // Store start and end times as data attributes
    const startStr = startTime.toISOString();
    const endStr = endTime.toISOString();
    const durationMs = endTime.getTime() - startTime.getTime();

    // Render translucent rectangle
    return `<rect
      x="${x1}"
      y="${padding.top}"
      width="${width}"
      height="${rectHeight}"
      fill="rgba(230, 126, 34, 0.15)"
      stroke="rgba(230, 126, 34, 0.4)"
      stroke-width="1"
      class="dhw-period"
      data-dhw-id="${dhwId}"
      data-start="${startStr}"
      data-end="${endStr}"
      data-duration="${durationMs}"
      style="cursor: pointer;"
    />`;
  }

  renderArea(dataPoints, scaleX, scaleY, height, padding, color, label) {
    if (dataPoints.length === 0) return '';
    // Skip rendering if this area is hidden
    if (this._hiddenLines.has(label)) return '';

    let pathData = `M ${scaleX(dataPoints[0].time)} ${height - padding.bottom} `;

    dataPoints.forEach(point => {
      pathData += `L ${scaleX(point.time)} ${scaleY(point.value)} `;
    });

    pathData += `L ${scaleX(dataPoints[dataPoints.length - 1].time)} ${height - padding.bottom} Z`;

    // Create a hover-able area on top
    const hoverArea = label ? `<path d="${pathData}" fill="transparent" class="area-hover" data-label="${label}" data-color="${color}" style="cursor: pointer;" />` : '';

    // Visible filled area
    const visibleArea = `<path d="${pathData}" fill="${color}" style="pointer-events: none;" />`;

    return visibleArea + hoverArea;
  }

  renderLine(dataPoints, scaleX, scaleY, color, label, dashArray = null) {
    if (dataPoints.length === 0) return '';
    // Skip rendering if this line is hidden
    if (this._hiddenLines.has(label)) return '';

    let pathData = `M ${scaleX(dataPoints[0].time)} ${scaleY(dataPoints[0].value)} `;

    // Use step interpolation to avoid diagonal lines when values change periodically
    for (let i = 1; i < dataPoints.length; i++) {
      // First go horizontally to the new time, keeping the old value
      pathData += `L ${scaleX(dataPoints[i].time)} ${scaleY(dataPoints[i - 1].value)} `;
      // Then go vertically to the new value at the new time
      pathData += `L ${scaleX(dataPoints[i].time)} ${scaleY(dataPoints[i].value)} `;
    }

    const strokeDash = dashArray ? `stroke-dasharray="${dashArray}"` : '';

    // Create a unique identifier for this line
    const lineId = label.replace(/\s+/g, '-').toLowerCase();

    // Create a wider invisible path for better hover detection
    const hoverPath = `<path d="${pathData}" fill="none" stroke="transparent" stroke-width="10" class="line-hover" data-label="${label}" data-color="${color}" data-line-id="${lineId}" style="cursor: pointer;" />`;

    // Visible line with matching ID
    const visiblePath = `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="1.5" ${strokeDash} class="line-visible" data-line-id="${lineId}" style="pointer-events: none; transition: stroke-width 0.15s ease;" />`;

    return hoverPath + visiblePath;
  }

  renderAxes(scaleX, scaleY, timeLabels, tempMin, tempMax, padding, width, height) {
    const tempTicks = this.generateTicks(tempMin, tempMax, 8);

    let axes = '';

    // Time axis labels
    timeLabels.forEach(label => {
      const x = scaleX(label.time);
      axes += `
        <text x="${x}" y="${height - padding.bottom + 20}"
              text-anchor="middle" class="axis-label">
          ${label.label}
        </text>
      `;
    });

    // Temperature axis labels (left)
    tempTicks.forEach(tick => {
      const y = scaleY(tick);
      axes += `
        <text x="${padding.left - 10}" y="${y + 4}"
              text-anchor="end" class="axis-label">
          ${tick.toFixed(0)}
        </text>
      `;
    });

    // Axis lines
    axes += `
      <line x1="${padding.left}" y1="${padding.top}"
            x2="${padding.left}" y2="${height - padding.bottom}"
            class="axis-line" stroke-width="2" />
      <line x1="${padding.left}" y1="${height - padding.bottom}"
            x2="${width - padding.right}" y2="${height - padding.bottom}"
            class="axis-line" stroke-width="2" />
    `;

    return axes;
  }

  generateTimeLabels(startTime, endTime, hours) {
    const labels = [];
    const duration = endTime.getTime() - startTime.getTime();
    const numLabels = Math.min(hours * 2, 12); // Max 12 labels

    for (let i = 0; i <= numLabels; i++) {
      const time = new Date(startTime.getTime() + (duration * i / numLabels));
      const label = hours <= 1
        ? `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
        : hours <= 24
        ? `${time.getHours().toString().padStart(2, '0')}:00`
        : `${time.getDate()}/${time.getMonth() + 1}`;

      labels.push({ time, label });
    }

    return labels;
  }

  generateTicks(min, max, count) {
    const range = max - min;
    const step = range / (count - 1);
    const ticks = [];
    for (let i = 0; i < count; i++) {
      ticks.push(min + (step * i));
    }
    return ticks;
  }

  calculateEnergy(powerData, startTime, endTime) {
    if (powerData.length === 0) return 0;

    let totalEnergy = 0;

    for (let i = 0; i < powerData.length - 1; i++) {
      const power = powerData[i].value; // in watts
      const duration = (powerData[i + 1].time - powerData[i].time) / (1000 * 60 * 60); // in hours
      totalEnergy += (power * duration) / 1000; // convert to kWh
    }

    return totalEnergy;
  }

  // Calculate energy for a specific mode (CH, DHW, or null for all)
  calculateEnergyByMode(powerData, modeData, targetMode) {
    if (powerData.length === 0) return 0;
    if (!modeData || modeData.length === 0) return 0;

    let totalEnergy = 0;

    for (let i = 0; i < powerData.length - 1; i++) {
      const power = powerData[i].value; // in watts
      const startTime = powerData[i].time;
      const endTime = powerData[i + 1].time;
      const duration = (endTime - startTime) / (1000 * 60 * 60); // in hours

      // Find the mode at this time
      const currentMode = this.getModeAtTime(modeData, startTime);

      // If targetMode is specified, only count energy when in that mode
      if (!targetMode || currentMode === targetMode) {
        totalEnergy += (power * duration) / 1000; // convert to kWh
      }
    }

    return totalEnergy;
  }

  // Helper function to get the mode at a specific time
  getModeAtTime(modeData, time) {
    if (!modeData || modeData.length === 0) return null;

    // Find the most recent mode change before or at this time
    for (let i = modeData.length - 1; i >= 0; i--) {
      if (modeData[i].time <= time) {
        return modeData[i].state;
      }
    }

    return null;
  }

  getCardSize() {
    return 5;
  }

  static getConfigElement() {
    return document.createElement('heat-pump-timeline-card-editor');
  }

  static getStubConfig() {
    return {
      power_in_entity: '',
      power_out_entity: '',
      flow_temp_entity: '',
      return_temp_entity: '',
      outside_temp_entity: '',
      inside_temp_entity: '',
      setpoint_entity: '',
      weather_curve_setpoint_entity: '',
      flow_setpoint_entity: '',
      flow_rate_entity: '',
      mode_entity: '',
      immersion_entity: '',
      hours: 1,
      title: 'Heat Pump Timeline',
      width: 1000,
      height: 400,
    };
  }
}

customElements.define('heat-pump-timeline-card', HeatPumpTimelineCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'heat-pump-timeline-card',
  name: 'Heat Pump Timeline Card',
  description: 'A time-series chart showing heat pump performance with COP calculation'
});
