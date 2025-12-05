#include "uv_segmentation.h"
#include <igl/adjacency_list.h>
#include <igl/edge_topology.h>
#include <igl/dihedral_angles.h>
#include <igl/barycenter.h>
#include <igl/doublearea.h>
#include <queue>
#include <unordered_set>
#include <cmath>

namespace UVUnwrapping {

/**
 * @brief 计算边的二面角
 */
double computeDihedralAngle(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    int f1, int f2,
    int e0, int e1
) {
    if (f1 < 0 || f2 < 0 || f1 >= F.rows() || f2 >= F.rows()) return 0.0;
    
    // 检查顶点索引是否有效
    for (int i = 0; i < 3; ++i) {
        if (F(f1, i) < 0 || F(f1, i) >= V.rows()) return 0.0;
        if (F(f2, i) < 0 || F(f2, i) >= V.rows()) return 0.0;
    }
    
    // 计算两个面的法向量
    Eigen::Vector3d v0 = V.row(F(f1, 0));
    Eigen::Vector3d v1 = V.row(F(f1, 1));
    Eigen::Vector3d v2 = V.row(F(f1, 2));
    Eigen::Vector3d n1 = (v1 - v0).cross(v2 - v0);
    if (n1.norm() < 1e-10) return 0.0;
    n1.normalize();
    
    v0 = V.row(F(f2, 0));
    v1 = V.row(F(f2, 1));
    v2 = V.row(F(f2, 2));
    Eigen::Vector3d n2 = (v1 - v0).cross(v2 - v0);
    if (n2.norm() < 1e-10) return 0.0;
    n2.normalize();
    
    // 计算二面角
    double cos_angle = n1.dot(n2);
    cos_angle = std::max(-1.0, std::min(1.0, cos_angle));
    return std::acos(cos_angle) * 180.0 / M_PI;
}

std::vector<std::vector<int>> detectEdgeLoops(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double feature_angle
) {
    std::vector<std::vector<int>> edge_loops;
    
    // 简化实现：直接使用面的边作为分割
    // 对于简单网格，每个边作为一个潜在的切割位置
    
    // 构建边集合
    std::map<std::pair<int,int>, std::vector<int>> edge_to_faces;
    
    for (int fi = 0; fi < F.rows(); ++fi) {
        for (int i = 0; i < 3; ++i) {
            int v0 = F(fi, i);
            int v1 = F(fi, (i + 1) % 3);
            if (v0 > v1) std::swap(v0, v1);
            edge_to_faces[{v0, v1}].push_back(fi);
        }
    }
    
    // 找边界边和高二面角边
    std::vector<std::pair<int,int>> feature_edges_list;
    
    for (const auto& [edge, faces] : edge_to_faces) {
        if (faces.size() == 1) {
            // 边界边
            feature_edges_list.push_back(edge);
        } else if (faces.size() == 2) {
            // 计算二面角
            int f1 = faces[0];
            int f2 = faces[1];
            double angle = computeDihedralAngle(V, F, f1, f2, edge.first, edge.second);
            if (angle > feature_angle) {
                feature_edges_list.push_back(edge);
            }
        }
    }
    
    // 简化：将所有特征边作为一个大的"边环"返回
    if (!feature_edges_list.empty()) {
        std::vector<int> loop;
        std::set<int> vertices_set;
        for (const auto& edge : feature_edges_list) {
            vertices_set.insert(edge.first);
            vertices_set.insert(edge.second);
        }
        loop.assign(vertices_set.begin(), vertices_set.end());
        if (loop.size() >= 3) {
            edge_loops.push_back(loop);
        }
    }
    
    return edge_loops;
}

std::vector<UVIsland> segmentByEdgeLoops(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const std::vector<std::vector<int>>& edge_loops
) {
    std::vector<UVIsland> islands;
    
    // 标记需要切割的边
    std::set<Edge> cut_edges;
    for (const auto& loop : edge_loops) {
        for (size_t i = 0; i < loop.size(); ++i) {
            int v0 = loop[i];
            int v1 = loop[(i + 1) % loop.size()];
            cut_edges.insert(Edge(v0, v1));
        }
    }
    
    // 使用 BFS 分离 UV 岛
    std::vector<int> face_to_island(F.rows(), -1);
    int island_id = 0;
    
    // 构建面邻接关系
    std::vector<std::vector<int>> adjacency_list;
    igl::adjacency_list(F, adjacency_list);
    
    for (int start_face = 0; start_face < F.rows(); ++start_face) {
        if (face_to_island[start_face] >= 0) continue;
        
        UVIsland island;
        std::queue<int> queue;
        queue.push(start_face);
        face_to_island[start_face] = island_id;
        
        while (!queue.empty()) {
            int current_face = queue.front();
            queue.pop();
            island.faces.push_back(current_face);
            
            // 检查相邻面
            for (int i = 0; i < 3; ++i) {
                int v0 = F(current_face, i);
                int v1 = F(current_face, (i + 1) % 3);
                Edge e(v0, v1);
                
                // 如果是切割边，跳过
                if (cut_edges.count(e)) {
                    island.boundary.push_back(e);
                    continue;
                }
                
                // 找相邻面 - 检查边界
                if (v0 < 0 || v0 >= adjacency_list.size()) continue;
                
                for (int adj_face : adjacency_list[v0]) {
                    if (adj_face < 0 || adj_face >= F.rows()) continue;
                    if (face_to_island[adj_face] < 0) {
                        // 检查是否共享边
                        bool shares_edge = false;
                        for (int j = 0; j < 3; ++j) {
                            int adj_v0 = F(adj_face, j);
                            int adj_v1 = F(adj_face, (j + 1) % 3);
                            if ((adj_v0 == v0 && adj_v1 == v1) || 
                                (adj_v0 == v1 && adj_v1 == v0)) {
                                shares_edge = true;
                                break;
                            }
                        }
                        
                        if (shares_edge) {
                            queue.push(adj_face);
                            face_to_island[adj_face] = island_id;
                        }
                    }
                }
            }
        }
        
        // 计算岛的质心和面积
        Eigen::MatrixXd BC;
        igl::barycenter(V, F, BC);
        
        island.centroid = Eigen::Vector3d::Zero();
        island.area = 0.0;
        
        Eigen::VectorXd areas;
        igl::doublearea(V, F, areas);
        areas /= 2.0;
        
        for (int fi : island.faces) {
            island.centroid += BC.row(fi) * areas(fi);
            island.area += areas(fi);
        }
        island.centroid /= island.area;
        
        islands.push_back(island);
        ++island_id;
    }
    
    return islands;
}

} // namespace UVUnwrapping
