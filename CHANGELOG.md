# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of Heat Pump Timeline Card
- Interactive timeline chart with power and temperature data
- Click-and-drag zoom functionality
- DHW mode visualization with translucent rectangles
- SCOP calculations separated by mode (CH, DHW, Combined)
- Smart tooltips showing related metrics:
  - Flow/Return temps with Delta-T and Overshoot
  - Power values with COP calculation
  - Weather Curve and Flow Setpoint with Modulation
  - Room Temp and Setpoint with Overshoot
- Step interpolation for accurate periodic data representation
- Hover effects with line embiggen
- Flexible time ranges (1h, 6h, 1d, 1w, 1m, custom)
- Time window boundaries display
- Automatic unit detection (W/kW conversion)
- Support for multiple optional entities:
  - Temperature sensors (flow, return, outside, inside)
  - Setpoint sensors (heating, weather curve, flow)
  - Flow rate sensor
  - Mode tracking sensor
  - Immersion heater sensor

### Fixed
- Responsive SVG scaling for accurate zoom coordinates
- Mode data parsing for string states (DHW, CH, etc.)

## Version History

### [1.0.0] - YYYY-MM-DD
- Initial public release

[Unreleased]: https://github.com/matban666/heat-pump-timeline-card/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/matban666/heat-pump-timeline-card/releases/tag/v1.0.0
