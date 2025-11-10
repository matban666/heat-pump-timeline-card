# Gemini Development Guide for Heat Pump Timeline Card

This document provides guidance for using Gemini to assist in the development and maintenance of the Heat Pump Timeline Card project.

## 1. Project Overview

The **Heat Pump Timeline Card** is a custom Lovelace card for Home Assistant. It provides an interactive timeline chart for visualizing heat pump performance metrics, including:

-   **Interactive Timeline:** With zoom and pan functionality.
-   **SCOP Calculations:** For Central Heating (CH), Domestic Hot Water (DHW), and combined performance.
-   **Smart Tooltips:** Displaying contextual information like COP, Delta-T, and setpoint modulation.
-   **Mode Visualization:** Clearly indicating different operating modes like DHW cycles.

The goal of this project is to offer heat pump owners detailed insights into their system's efficiency and operational patterns.

## 2. Codebase Structure

The project is a JavaScript-based frontend component for Home Assistant.

### Key Files

-   `heat-pump-timeline-card.js`: (Located in `dist/`) The main, compiled JavaScript file for the card. This is the primary file to be modified for new features.
-   `README.md`: The main documentation file for users.
-   `INSTALLATION.md`: Detailed instructions for installation.
-   `hacs.json`: Configuration file for the Home Assistant Community Store (HACS).
-   `info.md`: A brief overview of the card's features.

## 3. Development with Gemini

Gemini can be a powerful assistant for various development tasks on this project.

### 3.1. Adding New Features

**Objective:** To add a new sensor or visualization to the card.

**Example Prompt:**

> "I want to add a new sensor `sensor.heat_pump_pressure` to the timeline chart. This should be displayed as a new line on the chart. Can you modify `dist/heat-pump-timeline-card.js` to include this new sensor as an optional entity `pressure_entity`?"

**Gemini's Role:**

1.  **Analyze the request:** Understand the goal is to add a new optional sensor.
2.  **Read the code:** Examine `dist/heat-pump-timeline-card.js` to understand how existing entities are handled.
3.  **Modify the code:**
    -   Add a new configuration option `pressure_entity`.
    -   Fetch the history for this new entity from Home Assistant.
    -   Add a new line to the chart to display the data.
    -   Update tooltips and other relevant parts of the card.
4.  **Provide the changes:** Present the modified code, ready for review and testing.

### 3.2. Improving Documentation

**Objective:** To enhance the user documentation.

**Example Prompt:**

> "Based on the current `README.md`, can you create a new section that explains how to interpret the SCOP values? Explain what CH SCOP, DHW SCOP, and Combined SCOP mean in practical terms for a homeowner."

**Gemini's Role:**

1.  **Read the existing documentation:** To understand the context and style.
2.  **Generate new content:** Write a clear and concise explanation of the SCOP metrics.
3.  **Format the output:** Provide the new section in Markdown, ready to be inserted into `README.md`.

### 3.3. Refactoring Code

**Objective:** To improve the structure or efficiency of the code.

**Example Prompt:**

> "The data processing logic in `dist/heat-pump-timeline-card.js` is becoming complex. Can you refactor the main data handling function into smaller, more manageable functions? For example, separate functions for fetching data, processing temperatures, and calculating power."

**Gemini's Role:**

1.  **Analyze the code:** Identify the large function responsible for data processing.
2.  **Propose a refactoring plan:** Break down the logic into smaller, single-responsibility functions.
3.  **Implement the refactoring:** Rewrite the code with the new structure, ensuring all existing functionality remains intact.

### 3.4. Troubleshooting

**Objective:** To diagnose and fix a bug reported by a user.

**Example Prompt:**

> "A user has reported that the DHW mode visualization is not appearing, even when the `mode_entity` is correctly configured. The `mode_entity` has states like 'dhw' and 'heating'. Can you investigate `dist/heat-pump-timeline-card.js` and find the potential cause of this issue?"

**Gemini's Role:**

1.  **Search the code:** Look for the logic related to the `mode_entity` and DHW visualization.
2.  **Identify potential issues:**
    -   Is the code correctly checking for the 'dhw' state?
    -   Are there any case-sensitivity issues?
    -   Is the data being fetched correctly?
3.  **Suggest a fix:** Propose a code modification to resolve the bug.

## 4. Future Directions

Potential future enhancements for the card where Gemini could assist:

-   **Long-term statistics:** Integrating with Home Assistant's long-term statistics for yearly SCOP calculations.
-   **Cost analysis:** Adding the ability to input electricity costs to calculate running costs.
-   **Improved mobile view:** Optimizing the card's layout for smaller screens.
-   **HACS Integration:** Assisting with the process of getting the card added to the default HACS repository.
