#include "uv_unwrapping.h"
#include <igl/boundary_loop.h>
#include <igl/vertex_triangle_adjacency.h>
#include <Eigen/Sparse>
#include <cmath>
#include <iostream>
#include <queue>

namespace UVUnwrapping {

/**
 * @brief ABF 算法的核心实现
 * 
 * 基于论文：
 * "ABF++: Fast and Robust Angle Based Flattening"
 * Sheffer et al., 2005
 */
class ABFSolver {
public:
    ABFSolver(const Eigen::MatrixXd& V, const Eigen::MatrixXi& F)
        : V_(V), F_(F) {
        n_vertices_ = V.rows();
        n_faces_ = F.rows();
        n_angles_ = 3 * n_faces_;
    }
    
    /**
     * @brief 计算 3D 网格中的角度
     */
    void computeOriginalAngles() {
        alpha_3d_.resize(n_angles_);
        
        for (int fi = 0; fi < n_faces_; ++fi) {
            for (int j = 0; j < 3; ++j) {
                int v0 = F_(fi, j);
                int v1 = F_(fi, (j + 1) % 3);
                int v2 = F_(fi, (j + 2) % 3);
                
                Eigen::Vector3d p0 = V_.row(v0);
                Eigen::Vector3d p1 = V_.row(v1);
                Eigen::Vector3d p2 = V_.row(v2);
                
                Eigen::Vector3d e1 = (p1 - p0).normalized();
                Eigen::Vector3d e2 = (p2 - p0).normalized();
                
                double cos_angle = e1.dot(e2);
                cos_angle = std::max(-1.0, std::min(1.0, cos_angle));
                
                alpha_3d_[3 * fi + j] = std::acos(cos_angle);
            }
        }
    }
    
    /**
     * @brief 初始化平面角度（使用 3D 角度）
     */
    void initializePlanarAngles() {
        alpha_ = alpha_3d_;
    }
    
    /**
     * @brief 构建约束系统
     * 
 * 约束：
     * 1. 每个三角形的角度和 = π
     * 2. 每个内部顶点周围的角度和 = 2π
     * 3. 边界顶点的角度和取决于边界形状
     */
    void buildConstraints() {
        // 统计约束数量
        int n_triangle_constraints = n_faces_;
        int n_vertex_constraints = n_vertices_;
        int n_constraints = n_triangle_constraints + n_vertex_constraints;
        
        // 构建约束矩阵 C 和右侧 b
        typedef Eigen::Triplet<double> T;
        std::vector<T> triplets;
        b_.resize(n_constraints);
        b_.setZero();
        
        // 三角形约束：每个三角形的三个角度和 = π
        for (int fi = 0; fi < n_faces_; ++fi) {
            for (int j = 0; j < 3; ++j) {
                triplets.push_back(T(fi, 3 * fi + j, 1.0));
            }
            b_(fi) = M_PI;
        }
        
        // 顶点约束：每个顶点周围的角度和
        std::vector<std::vector<int>> vertex_angles(n_vertices_);
        
        for (int fi = 0; fi < n_faces_; ++fi) {
            for (int j = 0; j < 3; ++j) {
                int vi = F_(fi, j);
                vertex_angles[vi].push_back(3 * fi + j);
            }
        }
        
        // 找边界
        std::vector<std::vector<int>> boundaries;
        igl::boundary_loop(F_, boundaries);
        std::set<int> boundary_vertices;
        for (const auto& bnd : boundaries) {
            for (int vi : bnd) {
                boundary_vertices.insert(vi);
            }
        }
        
        for (int vi = 0; vi < n_vertices_; ++vi) {
            int constraint_idx = n_triangle_constraints + vi;
            
            for (int angle_idx : vertex_angles[vi]) {
                triplets.push_back(T(constraint_idx, angle_idx, 1.0));
            }
            
            // 内部顶点：2π，边界顶点：π
            if (boundary_vertices.count(vi)) {
                b_(constraint_idx) = M_PI;
            } else {
                b_(constraint_idx) = 2.0 * M_PI;
            }
        }
        
        C_.resize(n_constraints, n_angles_);
        C_.setFromTriplets(triplets.begin(), triplets.end());
    }
    
    /**
     * @brief ABF 能量函数
     * 
     * E = Σ (α_i - α_i^3D)² / α_i^3D
     */
    double computeEnergy() {
        double energy = 0.0;
        
        for (int i = 0; i < n_angles_; ++i) {
            double diff = alpha_(i) - alpha_3d_(i);
            energy += (diff * diff) / alpha_3d_(i);
        }
        
        return energy;
    }
    
    /**
     * @brief 优化角度
     */
    bool optimize(int max_iterations, double tolerance) {
        computeOriginalAngles();
        initializePlanarAngles();
        buildConstraints();
        
        double prev_energy = computeEnergy();
        
        for (int iter = 0; iter < max_iterations; ++iter) {
            // 计算梯度
            Eigen::VectorXd grad(n_angles_);
            for (int i = 0; i < n_angles_; ++i) {
                grad(i) = 2.0 * (alpha_(i) - alpha_3d_(i)) / alpha_3d_(i);
            }
            
            // 使用拉格朗日乘数法求解
            // (H + λC^T C) Δα = -grad - λC^T (Cα - b)
            
            Eigen::VectorXd constraint_violation = C_ * alpha_ - b_;
            double max_violation = constraint_violation.cwiseAbs().maxCoeff();
            
            if (max_violation < tolerance) {
                std::cout << "ABF converged in " << iter << " iterations." << std::endl;
                return true;
            }
            
            // 简化的牛顿步骤
            double lambda = 0.1;  // 步长参数
            
            Eigen::SparseMatrix<double> H(n_angles_, n_angles_);
            H.setIdentity();
            for (int i = 0; i < n_angles_; ++i) {
                H.coeffRef(i, i) = 2.0 / alpha_3d_(i);
            }
            
            Eigen::SparseMatrix<double> A = H + lambda * (C_.transpose() * C_);
            Eigen::VectorXd rhs = -grad - lambda * C_.transpose() * constraint_violation;
            
            // 求解线性系统
            Eigen::SparseLU<Eigen::SparseMatrix<double>> solver;
            solver.compute(A);
            
            if (solver.info() != Eigen::Success) {
                std::cerr << "ABF: Failed to factorize system" << std::endl;
                return false;
            }
            
            Eigen::VectorXd delta = solver.solve(rhs);
            
            if (solver.info() != Eigen::Success) {
                std::cerr << "ABF: Failed to solve system" << std::endl;
                return false;
            }
            
            // 更新角度（带回溯线搜索）
            double step_size = 1.0;
            Eigen::VectorXd alpha_new = alpha_ + step_size * delta;
            
            // 确保角度为正
            for (int i = 0; i < n_angles_; ++i) {
                if (alpha_new(i) <= 0) {
                    alpha_new(i) = 1e-6;
                }
                if (alpha_new(i) >= M_PI) {
                    alpha_new(i) = M_PI - 1e-6;
                }
            }
            
            alpha_ = alpha_new;
            
            double current_energy = computeEnergy();
            
            if (std::abs(current_energy - prev_energy) < tolerance) {
                std::cout << "ABF converged (energy change) in " << iter << " iterations." << std::endl;
                return true;
            }
            
            prev_energy = current_energy;
        }
        
        std::cout << "ABF reached max iterations" << std::endl;
        return false;
    }
    
    /**
     * @brief 从优化的角度重建 UV 坐标
     */
    bool reconstructUV(Eigen::MatrixXd& UV) {
        UV.resize(n_vertices_, 2);
        UV.setZero();
        
        // 找一个起始三角形，固定它的位置
        // 第一个顶点在原点
        UV.row(F_(0, 0)) = Eigen::Vector2d(0, 0);
        
        // 第二个顶点在 x 轴上
        double edge_length = (V_.row(F_(0, 1)) - V_.row(F_(0, 0))).norm();
        UV.row(F_(0, 1)) = Eigen::Vector2d(edge_length, 0);
        
        // 第三个顶点根据角度计算
        double angle0 = alpha_[0];
        double angle1 = alpha_[1];
        double edge01_length = edge_length;
        double edge02_length = (V_.row(F_(0, 2)) - V_.row(F_(0, 0))).norm();
        
        UV(F_(0, 2), 0) = edge02_length * std::cos(angle0);
        UV(F_(0, 2), 1) = edge02_length * std::sin(angle0);
        
        // 使用 BFS 扩展到其他三角形
        std::set<int> placed_vertices;
        placed_vertices.insert(F_(0, 0));
        placed_vertices.insert(F_(0, 1));
        placed_vertices.insert(F_(0, 2));
        
        std::queue<int> face_queue;
        std::set<int> visited_faces;
        face_queue.push(0);
        visited_faces.insert(0);
        
        // 构建面邻接
        std::vector<std::vector<int>> face_adjacency(n_faces_);
        for (int fi = 0; fi < n_faces_; ++fi) {
            for (int fj = fi + 1; fj < n_faces_; ++fj) {
                int shared = 0;
                for (int i = 0; i < 3; ++i) {
                    for (int j = 0; j < 3; ++j) {
                        if (F_(fi, i) == F_(fj, j)) {
                            ++shared;
                        }
                    }
                }
                if (shared == 2) {
                    face_adjacency[fi].push_back(fj);
                    face_adjacency[fj].push_back(fi);
                }
            }
        }
        
        while (!face_queue.empty()) {
            int fi = face_queue.front();
            face_queue.pop();
            
            for (int adj_fi : face_adjacency[fi]) {
                if (visited_faces.count(adj_fi)) continue;
                
                // 找共享边
                std::vector<int> shared_verts;
                std::vector<int> new_verts;
                
                for (int i = 0; i < 3; ++i) {
                    int vi = F_(adj_fi, i);
                    if (placed_vertices.count(vi)) {
                        shared_verts.push_back(vi);
                    } else {
                        new_verts.push_back(vi);
                    }
                }
                
                if (shared_verts.size() == 2 && new_verts.size() == 1) {
                    // 计算新顶点的位置
                    int v0 = shared_verts[0];
                    int v1 = shared_verts[1];
                    int v_new = new_verts[0];
                    
                    // 找 v_new 在 adj_fi 中的局部索引
                    int local_idx = -1;
                    for (int i = 0; i < 3; ++i) {
                        if (F_(adj_fi, i) == v_new) {
                            local_idx = i;
                            break;
                        }
                    }
                    
                    if (local_idx >= 0) {
                        double angle = alpha_[3 * adj_fi + local_idx];
                        double edge_len = (V_.row(v_new) - V_.row(F_(adj_fi, (local_idx + 1) % 3))).norm();
                        
                        Eigen::Vector2d p0 = UV.row(v0);
                        Eigen::Vector2d p1 = UV.row(v1);
                        Eigen::Vector2d edge = p1 - p0;
                        
                        // 旋转边向量
                        double rot_angle = angle;
                        Eigen::Matrix2d rot;
                        rot << std::cos(rot_angle), -std::sin(rot_angle),
                               std::sin(rot_angle), std::cos(rot_angle);
                        
                        Eigen::Vector2d dir = rot * edge.normalized();
                        UV.row(v_new) = p0 + edge_len * dir;
                        
                        placed_vertices.insert(v_new);
                    }
                    
                    visited_faces.insert(adj_fi);
                    face_queue.push(adj_fi);
                }
            }
        }
        
        return true;
    }
    
    const Eigen::VectorXd& getAngles() const { return alpha_; }

private:
    const Eigen::MatrixXd& V_;
    const Eigen::MatrixXi& F_;
    int n_vertices_;
    int n_faces_;
    int n_angles_;
    
    Eigen::VectorXd alpha_3d_;   // 3D 原始角度
    Eigen::VectorXd alpha_;      // 优化的平面角度
    Eigen::SparseMatrix<double> C_;  // 约束矩阵
    Eigen::VectorXd b_;          // 约束右侧
};

UVResult unwrapABF(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    int max_iterations,
    double tolerance
) {
    UVResult result;
    
    ABFSolver solver(V, F);
    
    if (!solver.optimize(max_iterations, tolerance)) {
        std::cerr << "ABF optimization failed" << std::endl;
        result.UV = Eigen::MatrixXd::Zero(V.rows(), 2);
        result.distortion = std::numeric_limits<double>::infinity();
        return result;
    }
    
    if (!solver.reconstructUV(result.UV)) {
        std::cerr << "ABF UV reconstruction failed" << std::endl;
        result.distortion = std::numeric_limits<double>::infinity();
        return result;
    }
    
    // 归一化到 [0, 1]
    Eigen::Vector2d min_uv = result.UV.colwise().minCoeff();
    Eigen::Vector2d max_uv = result.UV.colwise().maxCoeff();
    Eigen::Vector2d range = max_uv - min_uv;
    
    if (range.norm() > 1e-10) {
        for (int i = 0; i < result.UV.rows(); ++i) {
            result.UV(i, 0) = (result.UV(i, 0) - min_uv(0)) / range(0);
            result.UV(i, 1) = (result.UV(i, 1) - min_uv(1)) / range(1);
        }
    }
    
    // 计算失真
    result.distortion = computeUVDistortion(V, F, result.UV);
    result.stretch = computeStretch(V, F, result.UV);
    
    return result;
}

UVResult unwrapABFPlusPlus(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    int max_iterations,
    double tolerance
) {
    // ABF++ 改进：
    // 1. 更好的初始化
    // 2. 更稳定的优化步骤
    // 3. 自适应步长
    
    // 目前使用标准 ABF 的实现
    // 实际的 ABF++ 需要更复杂的优化策略
    return unwrapABF(V, F, max_iterations, tolerance);
}

} // namespace UVUnwrapping
