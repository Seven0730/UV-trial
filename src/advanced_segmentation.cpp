#include "uv_segmentation.h"
#include <igl/adjacency_list.h>
#include <igl/per_face_normals.h>
#include <igl/barycenter.h>
#include <igl/doublearea.h>
#include <queue>
#include <cmath>

namespace UVUnwrapping {

std::vector<UVIsland> segmentByTextureFlow(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::Vector3d& texture_direction,
    double angle_threshold
) {
    // 计算面法向量
    Eigen::MatrixXd N;
    igl::per_face_normals(V, F, N);
    
    // 计算每个面相对于纹理方向的角度偏差
    Eigen::Vector3d tex_dir = texture_direction.normalized();
    std::vector<double> face_deviations(F.rows());
    
    for (int i = 0; i < F.rows(); ++i) {
        // 计算面的主方向（使用最长边的方向）
        Eigen::Vector3d v0 = V.row(F(i, 0));
        Eigen::Vector3d v1 = V.row(F(i, 1));
        Eigen::Vector3d v2 = V.row(F(i, 2));
        
        Eigen::Vector3d e0 = (v1 - v0).normalized();
        Eigen::Vector3d e1 = (v2 - v1).normalized();
        Eigen::Vector3d e2 = (v0 - v2).normalized();
        
        // 投影到切平面
        Eigen::Vector3d normal = N.row(i);
        e0 = (e0 - e0.dot(normal) * normal).normalized();
        e1 = (e1 - e1.dot(normal) * normal).normalized();
        e2 = (e2 - e2.dot(normal) * normal).normalized();
        
        Eigen::Vector3d tex_proj = (tex_dir - tex_dir.dot(normal) * normal).normalized();
        
        // 取与纹理方向最接近的边
        double angle0 = std::acos(std::abs(e0.dot(tex_proj))) * 180.0 / M_PI;
        double angle1 = std::acos(std::abs(e1.dot(tex_proj))) * 180.0 / M_PI;
        double angle2 = std::acos(std::abs(e2.dot(tex_proj))) * 180.0 / M_PI;
        
        face_deviations[i] = std::min({angle0, angle1, angle2});
    }
    
    // 标记切割边（跨越不同方向区域）
    std::set<Edge> cut_edges;
    std::vector<std::vector<int>> adjacency_list;
    igl::adjacency_list(F, adjacency_list);
    
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            int v0 = F(i, j);
            int v1 = F(i, (j + 1) % 3);
            
            // 找共享这条边的相邻面
            for (int adj_face : adjacency_list[v0]) {
                if (adj_face == i) continue;
                
                // 检查是否共享边
                bool shares_edge = false;
                for (int k = 0; k < 3; ++k) {
                    if ((F(adj_face, k) == v0 && F(adj_face, (k + 1) % 3) == v1) ||
                        (F(adj_face, k) == v1 && F(adj_face, (k + 1) % 3) == v0)) {
                        shares_edge = true;
                        break;
                    }
                }
                
                if (shares_edge) {
                    // 如果两个面的方向偏差相差很大
                    double dev_diff = std::abs(face_deviations[i] - face_deviations[adj_face]);
                    if (dev_diff > angle_threshold) {
                        cut_edges.insert(Edge(v0, v1));
                    }
                }
            }
        }
    }
    
    // 从切割边构建边环
    std::vector<std::vector<int>> edge_loops;
    if (!cut_edges.empty()) {
        std::map<int, std::vector<Edge>> vertex_to_edges;
        for (const Edge& e : cut_edges) {
            vertex_to_edges[e.v0].push_back(e);
            vertex_to_edges[e.v1].push_back(e);
        }
        
        std::set<Edge> visited_edges;
        for (const Edge& start_edge : cut_edges) {
            if (visited_edges.count(start_edge)) continue;
            
            std::vector<int> loop;
            Edge current_edge = start_edge;
            int current_vertex = current_edge.v1;
            int start_vertex = current_edge.v0;
            
            loop.push_back(start_vertex);
            visited_edges.insert(current_edge);
            
            // 追踪环
            for (int iter = 0; iter < V.rows(); ++iter) {
                loop.push_back(current_vertex);
                
                if (current_vertex == start_vertex && loop.size() > 2) {
                    break;
                }
                
                // 找下一条边
                Edge next_edge(-1, -1);
                for (const Edge& e : vertex_to_edges[current_vertex]) {
                    if (!visited_edges.count(e)) {
                        next_edge = e;
                        break;
                    }
                }
                
                if (next_edge.v0 == -1) break;
                
                visited_edges.insert(next_edge);
                current_vertex = (next_edge.v0 == current_vertex) ?
                               next_edge.v1 : next_edge.v0;
            }
            
            if (loop.size() >= 3) {
                edge_loops.push_back(loop);
            }
        }
    }
    
    if (edge_loops.empty()) {
        // 返回整个网格作为一个岛
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

std::vector<UVIsland> segmentByDetailIsolation(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const std::vector<int>& detail_faces
) {
    std::vector<UVIsland> islands;
    
    // 创建详细区域的岛
    UVIsland detail_island;
    detail_island.faces = detail_faces;
    
    // 找边界边
    std::set<Edge> detail_edges;
    for (int fi : detail_faces) {
        for (int j = 0; j < 3; ++j) {
            int v0 = F(fi, j);
            int v1 = F(fi, (j + 1) % 3);
            detail_edges.insert(Edge(v0, v1));
        }
    }
    
    // 找边界（只出现在详细面中的边）
    std::set<int> detail_face_set(detail_faces.begin(), detail_faces.end());
    for (int i = 0; i < F.rows(); ++i) {
        if (detail_face_set.count(i)) continue;
        
        for (int j = 0; j < 3; ++j) {
            int v0 = F(i, j);
            int v1 = F(i, (j + 1) % 3);
            Edge e(v0, v1);
            
            if (detail_edges.count(e)) {
                detail_island.boundary.push_back(e);
            }
        }
    }
    
    // 计算详细岛的质心和面积
    Eigen::MatrixXd BC;
    igl::barycenter(V, F, BC);
    Eigen::VectorXd areas;
    igl::doublearea(V, F, areas);
    areas /= 2.0;
    
    detail_island.centroid = Eigen::Vector3d::Zero();
    detail_island.area = 0.0;
    for (int fi : detail_faces) {
        detail_island.centroid += BC.row(fi) * areas(fi);
        detail_island.area += areas(fi);
    }
    if (detail_island.area > 0) {
        detail_island.centroid /= detail_island.area;
    }
    
    islands.push_back(detail_island);
    
    // 创建其余区域的岛
    std::vector<int> remaining_faces;
    for (int i = 0; i < F.rows(); ++i) {
        if (!detail_face_set.count(i)) {
            remaining_faces.push_back(i);
        }
    }
    
    if (!remaining_faces.empty()) {
        UVIsland remaining_island;
        remaining_island.faces = remaining_faces;
        remaining_island.boundary = detail_island.boundary;
        
        remaining_island.centroid = Eigen::Vector3d::Zero();
        remaining_island.area = 0.0;
        for (int fi : remaining_faces) {
            remaining_island.centroid += BC.row(fi) * areas(fi);
            remaining_island.area += areas(fi);
        }
        if (remaining_island.area > 0) {
            remaining_island.centroid /= remaining_island.area;
        }
        
        islands.push_back(remaining_island);
    }
    
    return islands;
}

std::vector<UVIsland> segmentBySymmetry(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::Vector4d& symmetry_plane,
    double tolerance
) {
    // 平面方程: ax + by + cz + d = 0
    Eigen::Vector3d normal(symmetry_plane(0), symmetry_plane(1), symmetry_plane(2));
    double d = symmetry_plane(3);
    
    // 将顶点分为两侧
    std::vector<int> side(V.rows());  // -1: 负侧, 0: 在平面上, 1: 正侧
    for (int i = 0; i < V.rows(); ++i) {
        double dist = V.row(i).dot(normal) + d;
        if (std::abs(dist) < tolerance) {
            side[i] = 0;
        } else if (dist > 0) {
            side[i] = 1;
        } else {
            side[i] = -1;
        }
    }
    
    // 找跨越对称平面的边
    std::set<Edge> symmetry_edges;
    for (int i = 0; i < F.rows(); ++i) {
        for (int j = 0; j < 3; ++j) {
            int v0 = F(i, j);
            int v1 = F(i, (j + 1) % 3);
            
            // 如果边跨越平面或在平面上
            if (side[v0] != side[v1] || side[v0] == 0 || side[v1] == 0) {
                symmetry_edges.insert(Edge(v0, v1));
            }
        }
    }
    
    // 从对称边构建边环
    std::vector<std::vector<int>> edge_loops;
    std::map<int, std::vector<Edge>> vertex_to_edges;
    for (const Edge& e : symmetry_edges) {
        vertex_to_edges[e.v0].push_back(e);
        vertex_to_edges[e.v1].push_back(e);
    }
    
    std::set<Edge> visited;
    for (const Edge& start_edge : symmetry_edges) {
        if (visited.count(start_edge)) continue;
        
        std::vector<int> loop;
        Edge current = start_edge;
        int start_v = current.v0;
        int current_v = current.v1;
        
        loop.push_back(start_v);
        visited.insert(current);
        
        for (int iter = 0; iter < V.rows(); ++iter) {
            loop.push_back(current_v);
            
            if (current_v == start_v && loop.size() > 2) break;
            
            Edge next(-1, -1);
            for (const Edge& e : vertex_to_edges[current_v]) {
                if (!visited.count(e)) {
                    next = e;
                    break;
                }
            }
            
            if (next.v0 == -1) break;
            
            visited.insert(next);
            current_v = (next.v0 == current_v) ? next.v1 : next.v0;
        }
        
        if (loop.size() >= 3) {
            edge_loops.push_back(loop);
        }
    }
    
    return segmentByEdgeLoops(V, F, edge_loops);
}

} // namespace UVUnwrapping
