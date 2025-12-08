#pragma once

#include <vector>
#include <Eigen/Core>
#include <Eigen/Sparse>
#include <Eigen/SparseCholesky>

/**
 * @file uv_geodesic.h
 * @brief Heat-Method geodesic distance solver and path extraction utilities.
 *
 * Implements the 4-step Heat Method:
 *  1. Solve (I - tΔ)u = u0 (short-time heat diffusion)
 *  2. Normalize the negative gradient field -∇u / |∇u|
 *  3. Solve Δφ = ∇·X for the scalar potential φ
 *  4. Follow -∇φ (discrete steepest descent) to trace geodesic polylines
 */

namespace UVGeodesic {

/**
 * @brief Result container for extracted polylines.
 */
struct GeodesicPath {
    std::vector<int> vertex_indices;          ///< Path as vertex indices, source -> target
    std::vector<Eigen::Vector3d> polyline;    ///< World-space polyline sampled on vertices
    double length = 0.0;                      ///< Distance at target vertex
};

/**
 * @brief Reusable Heat Method solver with pre-factorized linear systems.
 *
 * Typical usage:
 * @code
 * UVGeodesic::HeatGeodesicSolver solver(V, F);
 * Eigen::VectorXd distances = solver.computeDistance({source_vertex});
 * auto path = solver.tracePath(distances, source_vertex, target_vertex);
 * @endcode
 */
class HeatGeodesicSolver {
public:
    HeatGeodesicSolver() = default;
    HeatGeodesicSolver(const Eigen::MatrixXd& V,
                       const Eigen::MatrixXi& F,
                       double time_scale = 1.0) {
        initialize(V, F, time_scale);
    }

    /**
     * @brief Build Laplace-Beltrami, mass, and gradient operators.
     *
     * @param V Vertex positions (n x 3)
     * @param F Triangle indices (m x 3)
     * @param time_scale Multiplier applied to mean-edge-length^2 (default 1.0)
     */
    void initialize(const Eigen::MatrixXd& V,
                    const Eigen::MatrixXi& F,
                    double time_scale = 1.0);

    /**
     * @brief Solve for geodesic distance field using the heat method.
     *
     * @param sources Vertex indices where distance = 0
     * @return Eigen::VectorXd Distance per vertex
     */
    Eigen::VectorXd computeDistance(const std::vector<int>& sources) const;

    /**
     * @brief Trace a steepest-descent walk from target back to source.
     *
     * @param distance_field Output of computeDistance()
     * @param source Source vertex index
     * @param target Target vertex index
     * @param descent_epsilon Minimal decrease required per step
     * @return GeodesicPath Path indices, polyline, and path length
     */
    GeodesicPath tracePath(const Eigen::VectorXd& distance_field,
                           int source,
                           int target,
                           double descent_epsilon = 1e-6) const;

    /**
     * @return Whether the solver has valid pre-computation.
     */
    bool isInitialized() const { return initialized_; }

    /**
     * @return Cached vertex positions.
     */
    const Eigen::MatrixXd& vertices() const { return V_; }

    /**
     * @return Cached face indices.
     */
    const Eigen::MatrixXi& faces() const { return F_; }

private:
    Eigen::MatrixXd V_;
    Eigen::MatrixXi F_;
    Eigen::SparseMatrix<double> laplace_;       ///< Positive semi-definite Laplace-Beltrami
    Eigen::SparseMatrix<double> mass_;          ///< Lumped mass matrix
    Eigen::SparseMatrix<double> grad_;          ///< Discrete gradient operator
    Eigen::SparseMatrix<double> heat_matrix_;   ///< (M + t*L)
    Eigen::SparseMatrix<double> poisson_matrix_;///< (L + εM)
    Eigen::SimplicialLLT<Eigen::SparseMatrix<double>> heat_solver_;
    Eigen::SimplicialLLT<Eigen::SparseMatrix<double>> poisson_solver_;
    std::vector<std::vector<int>> adjacency_;
    Eigen::VectorXd face_areas_;                ///< 每个三角形面积
    Eigen::VectorXd face_area_weights_;         ///< 面积向量重复 3 次，用于散度
    double time_step_ = 0.0;
    bool initialized_ = false;
};

} // namespace UVGeodesic
