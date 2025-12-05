#include "uv_segmentation.h"
#include <igl/principal_curvature.h>
#include <igl/gaussian_curvature.h>
#include <igl/adjacency_list.h>
#include <igl/barycenter.h>
#include <igl/doublearea.h>
#include <queue>

namespace UVUnwrapping {

void computePrincipalCurvatures(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    Eigen::VectorXd& principal_min,
    Eigen::VectorXd& principal_max
) {
    Eigen::MatrixXd PD1, PD2;
    igl::principal_curvature(V, F, PD1, PD2, principal_min, principal_max);
}

Eigen::VectorXd computeGaussianCurvature(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F
) {
    Eigen::VectorXd K;
    igl::gaussian_curvature(V, F, K);
    
    // 归一化到每个顶点
    Eigen::VectorXd vertex_areas = Eigen::VectorXd::Zero(V.rows());
    Eigen::VectorXd face_areas;
    igl::doublearea(V, F, face_areas);
    face_areas /= 2.0;
    
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            vertex_areas(F(i, j)) += face_areas(i) / 3.0;
        }
    }
    
    for (int i = 0; i < K.size(); ++i) {
        if (vertex_areas(i) > 1e-10) {
            K(i) /= vertex_areas(i);
        }
    }
    
    return K;
}

std::vector<UVIsland> segmentByHighCurvature(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double curvature_threshold
) {
    // 计算主曲率
    Eigen::VectorXd K_min, K_max;
    computePrincipalCurvatures(V, F, K_min, K_max);
    
    // 计算平均曲率
    Eigen::VectorXd mean_curvature = (K_min + K_max) / 2.0;
    
    // 找高曲率边
    std::set<Edge> high_curvature_edges;
    
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            int v0 = F(i, j);
            int v1 = F(i, (j + 1) % 3);
            
            // 如果边的两个顶点的平均曲率都很高
            double avg_curv = (std::abs(mean_curvature(v0)) + 
                              std::abs(mean_curvature(v1))) / 2.0;
            
            if (avg_curv > curvature_threshold) {
                high_curvature_edges.insert(Edge(v0, v1));
            }
        }
    }
    
    // 使用高曲率边作为边环进行分割
    std::vector<std::vector<int>> edge_loops;
    std::set<int> visited_vertices;
    
    for (const Edge& e : high_curvature_edges) {
        if (visited_vertices.count(e.v0) || visited_vertices.count(e.v1)) {
            continue;
        }
        
        // 追踪连续的高曲率边
        std::vector<int> loop;
        std::queue<int> queue;
        queue.push(e.v0);
        visited_vertices.insert(e.v0);
        
        while (!queue.empty() && loop.size() < V.rows()) {
            int v = queue.front();
            queue.pop();
            loop.push_back(v);
            
            // 找相邻的高曲率顶点
            for (const Edge& edge : high_curvature_edges) {
                if (edge.v0 == v && !visited_vertices.count(edge.v1)) {
                    queue.push(edge.v1);
                    visited_vertices.insert(edge.v1);
                } else if (edge.v1 == v && !visited_vertices.count(edge.v0)) {
                    queue.push(edge.v0);
                    visited_vertices.insert(edge.v0);
                }
            }
        }
        
        if (loop.size() >= 3) {
            edge_loops.push_back(loop);
        }
    }
    
    // 使用边环分割
    return segmentByEdgeLoops(V, F, edge_loops);
}

std::vector<UVIsland> segmentByGaussianCurvature(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double gaussian_threshold
) {
    // 计算高斯曲率
    Eigen::VectorXd K = computeGaussianCurvature(V, F);
    
    // 标记需要切割的区域
    // 正高斯曲率（凸）和负高斯曲率（鞍形）都需要切
    std::set<Edge> cut_edges;
    
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            int v0 = F(i, j);
            int v1 = F(i, (j + 1) % 3);
            
            double k0 = K(v0);
            double k1 = K(v1);
            
            // 如果边跨越不同曲率区域
            bool v0_curved = std::abs(k0) > gaussian_threshold;
            bool v1_curved = std::abs(k1) > gaussian_threshold;
            
            // 或者曲率符号不同（凸到鞍形）
            bool sign_change = (k0 > gaussian_threshold && k1 < -gaussian_threshold) ||
                              (k0 < -gaussian_threshold && k1 > gaussian_threshold);
            
            if ((v0_curved != v1_curved) || sign_change) {
                cut_edges.insert(Edge(v0, v1));
            }
        }
    }
    
    // 从切割边构建边环
    std::map<int, std::vector<int>> vertex_to_edges;
    std::vector<Edge> edge_list(cut_edges.begin(), cut_edges.end());
    
    for (size_t i = 0; i < edge_list.size(); ++i) {
        vertex_to_edges[edge_list[i].v0].push_back(i);
        vertex_to_edges[edge_list[i].v1].push_back(i);
    }
    
    std::vector<std::vector<int>> edge_loops;
    std::set<int> visited_edges;
    
    for (size_t start_idx = 0; start_idx < edge_list.size(); ++start_idx) {
        if (visited_edges.count(start_idx)) continue;
        
        std::vector<int> loop;
        int current_edge = start_idx;
        int current_vertex = edge_list[current_edge].v1;
        int start_vertex = edge_list[current_edge].v0;
        
        loop.push_back(start_vertex);
        visited_edges.insert(current_edge);
        
        // 追踪环
        for (int iter = 0; iter < V.rows(); ++iter) {
            loop.push_back(current_vertex);
            
            if (current_vertex == start_vertex && loop.size() > 2) {
                break;  // 完成环
            }
            
            // 找下一条边
            int next_edge = -1;
            for (int ei : vertex_to_edges[current_vertex]) {
                if (!visited_edges.count(ei)) {
                    next_edge = ei;
                    break;
                }
            }
            
            if (next_edge == -1) break;
            
            visited_edges.insert(next_edge);
            current_vertex = (edge_list[next_edge].v0 == current_vertex) ?
                           edge_list[next_edge].v1 : edge_list[next_edge].v0;
        }
        
        if (loop.size() >= 3) {
            edge_loops.push_back(loop);
        }
    }
    
    if (edge_loops.empty()) {
        // 如果没有检测到边环，返回整个网格作为一个岛
        UVIsland island;
        island.faces.resize(F.rows());
        for (int i = 0; i < F.rows(); ++i) {
            island.faces[i] = i;
        }
        
        Eigen::MatrixXd BC;
        igl::barycenter(V, F, BC);
        Eigen::VectorXd areas;
        igl::doublearea(V, F, areas);
        areas /= 2.0;
        
        island.centroid = Eigen::Vector3d::Zero();
        island.area = 0.0;
        for (int i = 0; i < F.rows(); ++i) {
            island.centroid += BC.row(i) * areas(i);
            island.area += areas(i);
        }
        island.centroid /= island.area;
        
        return {island};
    }
    
    return segmentByEdgeLoops(V, F, edge_loops);
}

} // namespace UVUnwrapping
