package middleware

import (
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/prometheus/client_golang/prometheus"
)

// HTTPMetrics keeps the standard Prometheus HTTP-server collectors used by
// the API. Wire it up once at server boot via Register().
type HTTPMetrics struct {
	requestsTotal   *prometheus.CounterVec
	requestDuration *prometheus.HistogramVec
	inFlight        prometheus.Gauge
}

// NewHTTPMetrics constructs the metric set, registering with the default
// Prometheus registry. Re-registration (e.g. test reruns where server.New
// is called multiple times in one process) is handled gracefully: the
// existing collector is reused rather than panicking.
func NewHTTPMetrics(namespace string) *HTTPMetrics {
	return NewHTTPMetricsWithRegisterer(namespace, prometheus.DefaultRegisterer)
}

// NewHTTPMetricsWithRegisterer is the test-friendly variant: callers can
// supply an isolated registry to avoid global state between cases.
func NewHTTPMetricsWithRegisterer(namespace string, reg prometheus.Registerer) *HTTPMetrics {
	if namespace == "" {
		namespace = "app"
	}
	if reg == nil {
		reg = prometheus.DefaultRegisterer
	}
	requestsTotal := registerOrReuseCounter(reg, prometheus.CounterOpts{
		Namespace: namespace,
		Subsystem: "http",
		Name:      "requests_total",
		Help:      "Total HTTP requests processed, partitioned by method, route, and status.",
	}, []string{"method", "route", "status"})
	requestDuration := registerOrReuseHistogram(reg, prometheus.HistogramOpts{
		Namespace: namespace,
		Subsystem: "http",
		Name:      "request_duration_seconds",
		Help:      "HTTP request latency.",
		Buckets:   prometheus.DefBuckets,
	}, []string{"method", "route"})
	inFlight := registerOrReuseGauge(reg, prometheus.GaugeOpts{
		Namespace: namespace,
		Subsystem: "http",
		Name:      "in_flight_requests",
		Help:      "Number of HTTP requests currently being served.",
	})
	return &HTTPMetrics{
		requestsTotal:   requestsTotal,
		requestDuration: requestDuration,
		inFlight:        inFlight,
	}
}

func registerOrReuseCounter(reg prometheus.Registerer, opts prometheus.CounterOpts, labels []string) *prometheus.CounterVec {
	cv := prometheus.NewCounterVec(opts, labels)
	if err := reg.Register(cv); err != nil {
		var are prometheus.AlreadyRegisteredError
		if errorsAs(err, &are) {
			if existing, ok := are.ExistingCollector.(*prometheus.CounterVec); ok {
				return existing
			}
		}
		panic(err)
	}
	return cv
}

func registerOrReuseHistogram(reg prometheus.Registerer, opts prometheus.HistogramOpts, labels []string) *prometheus.HistogramVec {
	hv := prometheus.NewHistogramVec(opts, labels)
	if err := reg.Register(hv); err != nil {
		var are prometheus.AlreadyRegisteredError
		if errorsAs(err, &are) {
			if existing, ok := are.ExistingCollector.(*prometheus.HistogramVec); ok {
				return existing
			}
		}
		panic(err)
	}
	return hv
}

func registerOrReuseGauge(reg prometheus.Registerer, opts prometheus.GaugeOpts) prometheus.Gauge {
	g := prometheus.NewGauge(opts)
	if err := reg.Register(g); err != nil {
		var are prometheus.AlreadyRegisteredError
		if errorsAs(err, &are) {
			if existing, ok := are.ExistingCollector.(prometheus.Gauge); ok {
				return existing
			}
		}
		panic(err)
	}
	return g
}

// errorsAs is a tiny shim so this file can stay tidy without dragging in
// "errors" alongside the prometheus import.
func errorsAs(err error, target *prometheus.AlreadyRegisteredError) bool {
	if are, ok := err.(prometheus.AlreadyRegisteredError); ok {
		*target = are
		return true
	}
	return false
}

// Middleware returns an Echo middleware that observes each request. The route
// label uses the matched template (e.g. "/api/v1/users/:id") rather than the
// raw path, keeping cardinality bounded.
func (m *HTTPMetrics) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			m.inFlight.Inc()
			defer m.inFlight.Dec()

			err := next(c)

			route := c.Path()
			if route == "" {
				route = "unmatched"
			}
			status := strconv.Itoa(c.Response().Status)
			method := c.Request().Method

			m.requestsTotal.WithLabelValues(method, route, status).Inc()
			m.requestDuration.WithLabelValues(method, route).Observe(time.Since(start).Seconds())
			return err
		}
	}
}
