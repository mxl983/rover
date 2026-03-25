/**
 * Wheel / encoder model — must stay aligned with server/driver/TelemetryMonitor.py
 * (ppr, diameter, distance integration on M1).
 */
export const ROVER_ODOMETRY = {
  referenceMotor: "M1",
  wheelDiameterMm: 60,
  /** Same as TelemetryMonitor: 11 * 30 * 10 */
  pulsesPerWheelRev: 11 * 30 * 10,
};

const { wheelDiameterMm, pulsesPerWheelRev } = ROVER_ODOMETRY;
const mmPerWheelRev = Math.PI * wheelDiameterMm;
export const MM_PER_ENCODER_TICK = mmPerWheelRev / pulsesPerWheelRev;

export function getOdometryCalibrationSnapshot(cumulativeDistanceMm = 0) {
  return {
    referenceMotor: ROVER_ODOMETRY.referenceMotor,
    wheelDiameterMm: ROVER_ODOMETRY.wheelDiameterMm,
    pulsesPerWheelRev: ROVER_ODOMETRY.pulsesPerWheelRev,
    mmPerWheelRevApprox: +mmPerWheelRev.toFixed(4),
    mmPerEncoderTickApprox: +MM_PER_ENCODER_TICK.toFixed(6),
    cumulativePathMm: cumulativeDistanceMm,
    cumulativePathMeaning:
      "monotonic odometer: each sample adds abs(delta_encoder_ticks)/pulsesPerWheelRev*mmPerWheelRev; forward and reverse both increase this total",
  };
}
