#include "uv_geodesic.h"

#include <igl/cotmatrix.h>
#include <igl/massmatrix.h>
#include <igl/grad.h>
#include <igl/doublearea.h>

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace {

double compute_mean_edge_length(const Eigen::MatrixXd& V,
                                const Eigen::MatrixXi& F) {
    double total_length = 0.0;
    std::size_t edge_count = 0;
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            int v0 = F(i, j);
            int v1 = F(i, (j + 1) % 3);
            total_length += (V.row(v0) - V.row(v1)).norm();
            ++edge_count;
        }
    }
    if (edge_count == 0) {
        return 1.0;
    }
    return total_length / static_cast<double>(edge_count);
}

std::vector<std::vector<int>> build_adjacency(const Eigen::MatrixXi& F,
                                              int vertex_count) {
    std::vector<std::vector<int>> adjacency(vertex_count);
    auto add_edge = [&](int a, int b) {
        adjacency[a].push_back(b);
        adjacency[b].push_back(a);
    };

    for (int i = 0; i < F.rows(); ++i) {
        add_edge(F(i, 0), F(i, 1));
        add_edge(F(i, 1), F(i, 2));
        add_edge(F(i, 2), F(i, 0));
    }

    for (auto& neighbors : adjacency) {
        std::sort(neighbors.begin(), neighbors.end());
        neighbors.erase(std::unique(neighbors.begin(), neighbors.end()),
                        neighbors.end());
    }
    return adjacency;
}

} // namespace

namespace UVGeodesic {

void HeatGeodesicSolver::initialize(const Eigen::MatrixXd& V,
                                    const Eigen::MatrixXi& F,
                                    double time_scale) {
    if (V.rows() == 0 || F.rows() == 0) {
        throw std::invalid_argument("HeatGeodesicSolver requires a non-empty mesh.");
    }
    if (time_scale <= 0.0) {
        throw std::invalid_argument("time_scale must be positive.");
    }

    V_ = V;
    F_ = F;

    Eigen::SparseMatrix<double> cot_laplace;
    igl::cotmatrix(V_, F_, cot_laplace);
    laplace_ = -cot_laplace; // Positive semi-definite

    igl::massmatrix(V_, F_, igl::MASSMATRIX_TYPE_VORONOI, mass_);

    time_step_ = std::max(1e-7, time_scale * std::pow(compute_mean_edge_length(V_, F_), 2.0));
    heat_matrix_ = mass_ + time_step_ * laplace_;

    const double regularization = 1e-8;
    poisson_matrix_ = laplace_ + regularization * mass_;

    heat_solver_.compute(heat_matrix_);
    if (heat_solver_.info() != Eigen::Success) {
        throw std::runtime_error("Failed to factorize heat diffusion matrix.");
    }

    poisson_solver_.compute(poisson_matrix_);
    if (poisson_solver_.info() != Eigen::Success) {
        throw std::runtime_error("Failed to factorize Poisson system.");
    }

    igl::grad(V_, F_, grad_);

    Eigen::VectorXd dbl_area;
    igl::doublearea(V_, F_, dbl_area);
    face_areas_ = 0.5 * dbl_area;
    face_area_weights_.resize(3 * F_.rows());
    for (int f = 0; f < F_.rows(); ++f) {
        for (int c = 0; c < 3; ++c) {
            face_area_weights_(3 * f + c) = face_areas_(f);
        }
    }

    adjacency_ = build_adjacency(F_, static_cast<int>(V_.rows()));
    initialized_ = true;
}

Eigen::VectorXd HeatGeodesicSolver::computeDistance(const std::vector<int>& sources) const {
    if (!initialized_) {
        throw std::runtime_error("HeatGeodesicSolver::initialize must be called first.");
    }
    if (sources.empty()) {
        throw std::invalid_argument("At least one source vertex is required.");
    }

    const int n = static_cast<int>(V_.rows());
    Eigen::VectorXd delta = Eigen::VectorXd::Zero(n);
    for (int idx : sources) {
        if (idx < 0 || idx >= n) {
            throw std::out_of_range("Source vertex index is out of bounds.");
        }
        delta(idx) = 1.0;
    }

    Eigen::VectorXd heat_rhs = mass_ * delta;
    Eigen::VectorXd u = heat_solver_.solve(heat_rhs);
    if (heat_solver_.info() != Eigen::Success) {
        throw std::runtime_error("Heat diffusion solve failed.");
    }

    Eigen::VectorXd grad_u = grad_ * u;
    Eigen::MatrixXd X(F_.rows(), 3);
    for (int f = 0; f < F_.rows(); ++f) {
        Eigen::Vector3d g = -grad_u.segment<3>(3 * f); // -∇u
        double norm = g.norm();
        if (norm > 1e-12) {
            g /= norm;
        } else {
            g.setZero();
        }
        X.row(f) = g;
    }

    Eigen::VectorXd stacked_field(3 * F_.rows());
    for (int f = 0; f < F_.rows(); ++f) {
        stacked_field.segment<3>(3 * f) = X.row(f).transpose();
    }
    Eigen::VectorXd weighted_field = face_area_weights_.array() * stacked_field.array();
    Eigen::VectorXd div = -grad_.transpose() * weighted_field;

    Eigen::VectorXd phi = poisson_solver_.solve(div);
    if (poisson_solver_.info() != Eigen::Success) {
        throw std::runtime_error("Poisson solve failed.");
    }
    double reference = phi.minCoeff();

    Eigen::VectorXd distance = phi.array() - reference;
    for (int i = 0; i < distance.size(); ++i) {
        if (distance(i) < 0.0) {
            distance(i) = 0.0;
        }
    }
    return distance;
}

GeodesicPath HeatGeodesicSolver::tracePath(const Eigen::VectorXd& distance_field,
                                           int source,
                                           int target,
                                           double descent_epsilon) const {
    if (!initialized_) {
        throw std::runtime_error("HeatGeodesicSolver::initialize must be called first.");
    }
    const int n = static_cast<int>(V_.rows());
    if (distance_field.size() != n) {
        throw std::invalid_argument("distance_field size mismatch.");
    }
    if (source < 0 || source >= n || target < 0 || target >= n) {
        throw std::out_of_range("Vertex index out of bounds.");
    }

    std::vector<int> reversed_path;
    reversed_path.reserve(n);
    reversed_path.push_back(target);

    int current = target;
    const int max_steps = n * 2;
    for (int step = 0; step < max_steps && current != source; ++step) {
        double best_value = distance_field(current);
        int best_neighbor = current;
        for (int nb : adjacency_[current]) {
            double value = distance_field(nb);
            if (value + descent_epsilon < best_value) {
                best_value = value;
                best_neighbor = nb;
            }
        }
        if (best_neighbor == current) {
            // Local minimum, cannot progress further.
            break;
        }
        current = best_neighbor;
        reversed_path.push_back(current);
    }

    if (reversed_path.back() != source) {
        reversed_path.push_back(source);
    }

    std::reverse(reversed_path.begin(), reversed_path.end());

    GeodesicPath result;
    result.vertex_indices = reversed_path;
    result.polyline.reserve(reversed_path.size());
    for (int v : reversed_path) {
        result.polyline.emplace_back(V_.row(v));
    }
    result.length = distance_field(target);
    return result;
}

} // namespace UVGeodesic
