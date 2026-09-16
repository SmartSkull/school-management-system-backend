SELECT studentId, date, deviceId, clockIn FROM StudentAttendance WHERE date >= CURDATE() ORDER BY clockIn DESC LIMIT 10;
