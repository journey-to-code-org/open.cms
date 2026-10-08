use serde::Serialize;
use wasm_bindgen::prelude::*;

const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_POINTS: usize = 100_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    longitude: f64,
    latitude: f64,
    elevation: Option<f64>,
    distance_m: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    name: String,
    segments: Vec<Vec<Point>>,
    point_count: usize,
    distance_m: f64,
    ascent_m: f64,
    descent_m: f64,
    elevation_points: usize,
    elevation_pairs: usize,
    total_pairs: usize,
    min_elevation: Option<f64>,
    max_elevation: Option<f64>,
}

fn number(value: Option<&str>, label: &str) -> Result<f64, String> {
    let parsed = value
        .ok_or_else(|| format!("Missing {label}."))?
        .trim()
        .parse::<f64>()
        .map_err(|_| format!("Invalid {label}."))?;
    if !parsed.is_finite() {
        return Err(format!("{label} must be finite."));
    }
    Ok(parsed)
}

fn distance(a: &Point, b: &Point) -> f64 {
    let dlat = (b.latitude - a.latitude).to_radians();
    let dlon = (b.longitude - a.longitude).to_radians();
    let h = (dlat / 2.0).sin().powi(2)
        + a.latitude.to_radians().cos()
            * b.latitude.to_radians().cos()
            * (dlon / 2.0).sin().powi(2);
    6_371_008.8 * 2.0 * h.clamp(0.0, 1.0).sqrt().asin()
}

pub fn analyze(xml: &str) -> Result<Analysis, String> {
    if xml.len() > MAX_BYTES {
        return Err("GPX exceeds the 8 MiB limit.".into());
    }
    let document = roxmltree::Document::parse(xml).map_err(|e| format!("Invalid GPX XML: {e}"))?;
    let root = document.root_element();
    if root.tag_name().name() != "gpx" {
        return Err("Expected a GPX document, not another XML format.".into());
    }
    let mut result = Analysis {
        name: "Imported trail".into(),
        segments: vec![],
        point_count: 0,
        distance_m: 0.0,
        ascent_m: 0.0,
        descent_m: 0.0,
        elevation_points: 0,
        elevation_pairs: 0,
        total_pairs: 0,
        min_elevation: None,
        max_elevation: None,
    };
    let tracks: Vec<_> = root.children().filter(|n| n.has_tag_name("trk")).collect();
    let has_tracks = !tracks.is_empty();
    let containers: Vec<_> = if has_tracks {
        tracks
            .iter()
            .flat_map(|track| track.children().filter(|n| n.has_tag_name("trkseg")))
            .collect()
    } else {
        root.children().filter(|n| n.has_tag_name("rte")).collect()
    };
    let name_parent = if has_tracks {
        tracks.first().copied()
    } else {
        containers.first().copied()
    };
    if let Some(name) = name_parent.and_then(|parent| {
        parent
            .children()
            .find(|n| n.has_tag_name("name"))
            .and_then(|n| n.text())
    }) {
        result.name = name.trim().chars().take(160).collect();
        if result.name.is_empty() {
            result.name = "Imported trail".into();
        }
    }
    for container in containers {
        let mut segment: Vec<Point> = vec![];
        let point_tag = if has_tracks { "trkpt" } else { "rtept" };
        for node in container.children().filter(|n| n.has_tag_name(point_tag)) {
            result.point_count += 1;
            if result.point_count > MAX_POINTS {
                return Err("GPX exceeds the 100,000 point limit.".into());
            }
            let longitude = number(node.attribute("lon"), "longitude")?;
            let latitude = number(node.attribute("lat"), "latitude")?;
            if !(-180.0..=180.0).contains(&longitude) || !(-90.0..=90.0).contains(&latitude) {
                return Err("Coordinates are outside valid longitude/latitude ranges.".into());
            }
            let elevation = node
                .children()
                .find(|n| n.has_tag_name("ele"))
                .map(|n| number(n.text(), "elevation"))
                .transpose()?;
            if elevation.is_some_and(|value| !(-12_000.0..=10_000.0).contains(&value)) {
                return Err("Trail elevations must be between -12,000 and 10,000 meters.".into());
            }
            let mut point = Point {
                longitude,
                latitude,
                elevation,
                distance_m: result.distance_m,
            };
            if let Some(previous) = segment.last() {
                result.total_pairs += 1;
                result.distance_m += distance(previous, &point);
                point.distance_m = result.distance_m;
                if let (Some(a), Some(b)) = (previous.elevation, elevation) {
                    result.elevation_pairs += 1;
                    result.ascent_m += (b - a).max(0.0);
                    result.descent_m += (a - b).max(0.0);
                }
            }
            if let Some(e) = elevation {
                result.elevation_points += 1;
                result.min_elevation = Some(result.min_elevation.map_or(e, |v| v.min(e)));
                result.max_elevation = Some(result.max_elevation.map_or(e, |v| v.max(e)));
            }
            segment.push(point);
        }
        if !segment.is_empty() {
            result.segments.push(segment);
        }
    }
    if result.total_pairs == 0 {
        return Err("Include at least two points in a track segment or route. Waypoints alone are not a trail.".into());
    }
    Ok(result)
}

#[wasm_bindgen]
pub fn analyze_gpx(xml: &str) -> Result<String, JsValue> {
    let result = analyze(xml).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Validates west/south/east/north regional bounds before any geographic operation.
pub fn valid_bounds(west: f64, south: f64, east: f64, north: f64) -> bool {
    [west, south, east, north].iter().all(|value| value.is_finite()) &&
        west >= -180.0 && east <= 180.0 && south >= -90.0 && north <= 90.0 &&
        west < east && south < north
}

#[wasm_bindgen]
pub fn geo_validate_bounds(west: f64, south: f64, east: f64, north: f64) -> bool {
    valid_bounds(west, south, east, north)
}

#[wasm_bindgen]
pub fn geo_contains_point(longitude: f64, latitude: f64,
    west: f64, south: f64, east: f64, north: f64) -> bool {
    valid_bounds(west, south, east, north) && longitude.is_finite() && latitude.is_finite() &&
        longitude >= west && longitude <= east && latitude >= south && latitude <= north
}

type Coordinate = [f64; 2];

fn clip_segments(segments: Vec<Vec<Coordinate>>, west: f64, south: f64, east: f64, north: f64) -> Vec<Vec<Coordinate>> {
    if !valid_bounds(west, south, east, north) { return vec![]; }
    let mut result = Vec::new();
    for segment in segments {
        let mut current: Vec<Coordinate> = Vec::new();
        for pair in segment.windows(2) {
            let a = pair[0]; let b = pair[1];
            if !a.iter().chain(b.iter()).all(|value| value.is_finite()) { current.clear(); continue; }
            let dx = b[0] - a[0]; let dy = b[1] - a[1];
            let p = [-dx, dx, -dy, dy];
            let q = [a[0] - west, east - a[0], a[1] - south, north - a[1]];
            let mut start: f64 = 0.0; let mut end: f64 = 1.0; let mut visible = true;
            for edge in 0..4 {
                if p[edge] == 0.0 { if q[edge] < 0.0 { visible = false; } }
                else {
                    let ratio = q[edge] / p[edge];
                    if p[edge] < 0.0 { start = start.max(ratio); } else { end = end.min(ratio); }
                }
            }
            if !visible || start > end {
                if current.len() > 1 { result.push(std::mem::take(&mut current)); } else { current.clear(); }
                continue;
            }
            let clamp = |point: Coordinate| [point[0].clamp(west, east), point[1].clamp(south, north)];
            let first = clamp([a[0] + start * dx, a[1] + start * dy]);
            let last = clamp([a[0] + end * dx, a[1] + end * dy]);
            let inside_a = a[0] >= west && a[0] <= east && a[1] >= south && a[1] <= north;
            if current.last().is_none_or(|previous| *previous != first) || !inside_a {
                if current.len() > 1 { result.push(std::mem::take(&mut current)); } else { current.clear(); }
                current.push(first);
            }
            current.push(last);
            let inside_b = b[0] >= west && b[0] <= east && b[1] >= south && b[1] <= north;
            if !inside_b {
                if current.len() > 1 { result.push(std::mem::take(&mut current)); } else { current.clear(); }
            }
        }
        if current.len() > 1 { result.push(current); }
    }
    result
}

#[wasm_bindgen]
pub fn geo_clip_segments(segments_json: &str, bounds_json: &str) -> Result<String, JsValue> {
    let groups: Vec<Vec<Vec<Coordinate>>> = serde_json::from_str(segments_json).map_err(|error| JsValue::from_str(&format!("Invalid trail geometry: {error}")))?;
    let bounds: [f64; 4] = serde_json::from_str(bounds_json).map_err(|error| JsValue::from_str(&format!("Invalid region bounds: {error}")))?;
    if !valid_bounds(bounds[0], bounds[1], bounds[2], bounds[3]) { return Err(JsValue::from_str("Region bounds are invalid.")); }
    let clipped: Vec<Vec<Vec<Coordinate>>> = groups.into_iter().map(|segments|
        clip_segments(segments, bounds[0], bounds[1], bounds[2], bounds[3])).collect();
    serde_json::to_string(&clipped)
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_distance_and_climb() {
        let result = analyze(
            r#"<gpx><trk><name>Test</name><trkseg>
          <trkpt lat="0" lon="0"><ele>10</ele></trkpt>
          <trkpt lat="0" lon="1"><ele>110</ele></trkpt>
          <trkpt lat="0" lon="2"><ele>60</ele></trkpt>
        </trkseg></trk></gpx>"#,
        )
        .unwrap();
        assert!((result.distance_m - 222_390.16).abs() < 1.0);
        assert_eq!(result.ascent_m, 100.0);
        assert_eq!(result.descent_m, 50.0);
        assert_eq!(result.elevation_pairs, 2);
    }

    #[test]
    fn never_bridges_segments_or_missing_elevations() {
        let result = analyze(
            r#"<gpx><trk><trkseg>
          <trkpt lat="0" lon="0"><ele>0</ele></trkpt>
          <trkpt lat="0" lon="0.001"/>
          <trkpt lat="0" lon="0.002"><ele>100</ele></trkpt>
        </trkseg><trkseg>
          <trkpt lat="50" lon="50"><ele>900</ele></trkpt>
          <trkpt lat="50" lon="50.001"><ele>910</ele></trkpt>
        </trkseg></trk></gpx>"#,
        )
        .unwrap();
        assert!(result.distance_m < 400.0);
        assert_eq!(result.ascent_m, 10.0);
        assert_eq!(result.elevation_pairs, 1);
        assert_eq!(result.total_pairs, 3);
    }

    #[test]
    fn accepts_namespaced_routes_and_negative_elevation() {
        let result = analyze(
            r#"<gpx xmlns="http://www.topografix.com/GPX/1/1">
          <rte><rtept lat="0" lon="179.9"><ele>-5</ele></rtept>
          <rtept lat="0" lon="-179.9"><ele>0</ele></rtept></rte>
        </gpx>"#,
        )
        .unwrap();
        assert!(result.distance_m < 23_000.0);
        assert_eq!(result.min_elevation, Some(-5.0));
    }

    #[test]
    fn rejects_bad_data() {
        for xml in [
            "<not-gpx/>",
            "<gpx>",
            "<gpx><wpt lat=\"0\" lon=\"0\"/></gpx>",
            "<gpx><rte><rtept lat=\"91\" lon=\"0\"/></rte></gpx>",
            "<gpx><rte><rtept lat=\"NaN\" lon=\"0\"/></rte></gpx>",
            "<gpx><rte><rtept lat=\"0\" lon=\"0\"><ele>bad</ele></rtept></rte></gpx>",
            "<gpx><rte><rtept lat=\"0\" lon=\"0\"><ele>1e308</ele></rtept></rte></gpx>",
            "<!DOCTYPE gpx [<!ENTITY x 'bad'>]><gpx>&x;</gpx>",
        ] {
            assert!(analyze(xml).is_err(), "{xml}");
        }
    }

    #[test]
    fn enforces_limits() {
        assert!(analyze(&" ".repeat(MAX_BYTES + 1)).is_err());
        let xml = format!(
            "<gpx><rte>{}</rte></gpx>",
            r#"<rtept lat="0" lon="0"/>"#.repeat(MAX_POINTS + 1)
        );
        assert!(analyze(&xml).unwrap_err().contains("point limit"));
    }

    #[test]
    fn validates_regions_and_contains_points() {
        assert!(valid_bounds(-79.5, 39.2, -79.0, 39.8));
        assert!(!valid_bounds(-79.0, 39.2, -79.5, 39.8));
        assert!(!valid_bounds(-181.0, 39.2, -79.0, 39.8));
        assert!(geo_contains_point(-79.25, 39.5, -79.5, 39.2, -79.0, 39.8));
        assert!(!geo_contains_point(-80.0, 39.5, -79.5, 39.2, -79.0, 39.8));
    }

    #[test]
    fn clips_crossing_segments_without_joining_excursions() {
        let bounds = [-1.0, -1.0, 1.0, 1.0];
        let crossing = clip_segments(vec![vec![[-2.0, 0.0], [2.0, 0.0]]], bounds[0], bounds[1], bounds[2], bounds[3]);
        assert_eq!(crossing, vec![vec![[-1.0, 0.0], [1.0, 0.0]]]);
        let excursion = clip_segments(vec![vec![[0.5, 0.0], [2.0, 0.0], [2.0, 0.5], [0.5, 0.5]]], bounds[0], bounds[1], bounds[2], bounds[3]);
        assert_eq!(excursion.len(), 2);
    }
}
