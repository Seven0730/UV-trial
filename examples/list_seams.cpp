#include <iostream>
#include <fstream>
#include <vector>
#include <set>
#include <igl/read_triangle_mesh.h>
#include "uv_segmentation.h"

// 从UV岛提取缝合线（边的顶点索引对）
std::vector<std::pair<int, int>> extract_seams_from_islands(
    const Eigen::MatrixXi& F,
    const std::vector<UVSegmentation::UVIsland>& islands) {
    
    std::vector<std::pair<int, int>> seams;
    
    // 直接使用岛屿的边界边
    for (const auto& island : islands) {
        for (const auto& edge : island.boundary) {
            seams.push_back({edge.v0, edge.v1});
        }
    }
    
    return seams;
}

void print_seams(const std::string& method_name,
                 const std::vector<UVSegmentation::UVIsland>& islands,
                 const Eigen::MatrixXi& F) {
    
    auto seams = extract_seams_from_islands(F, islands);
    
    std::cout << "\n" << method_name << ":\n";
    std::cout << "  UV岛数量: " << islands.size() << "\n";
    std::cout << "  缝合线数量: " << seams.size() << "\n";
    
    if (seams.size() <= 20) {
        std::cout << "  缝合线列表:\n";
        for (const auto& seam : seams) {
            std::cout << "    边 (" << seam.first << ", " << seam.second << ")\n";
        }
    } else {
        std::cout << "  前10条缝合线:\n";
        for (size_t i = 0; i < 10 && i < seams.size(); i++) {
            std::cout << "    边 (" << seams[i].first << ", " << seams[i].second << ")\n";
        }
        std::cout << "    ... (共 " << seams.size() << " 条)\n";
    }
    
    // 统计每个岛的面数
    std::cout << "  每个UV岛的面数: ";
    for (size_t i = 0; i < islands.size() && i < 5; i++) {
        std::cout << islands[i].faces.size();
        if (i < islands.size() - 1) std::cout << ", ";
    }
    if (islands.size() > 5) {
        std::cout << ", ... (共 " << islands.size() << " 个岛)";
    }
    std::cout << "\n";
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "用法: " << argv[0] << " <mesh.obj>\n";
        std::cout << "\n功能: 列出不同分割算法的缝合线\n";
        return 1;
    }

    std::string mesh_file = argv[1];

    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    std::cout << "========================================\n";
    std::cout << "  缝合线列表工具\n";
    std::cout << "========================================\n\n";
    std::cout << "加载网格: " << mesh_file << "\n";
    
    if (!igl::read_triangle_mesh(mesh_file, V, F)) {
        std::cerr << "无法读取网格\n";
        return 1;
    }
    
    std::cout << "网格: " << V.rows() << " 顶点, " << F.rows() << " 面\n";
    
    using namespace UVSegmentation;
    
    std::cout << "\n========================================\n";
    std::cout << "测试分割算法:\n";
    std::cout << "========================================\n";
    
    // 1. 边缘环分割
    try {
        std::cout << "\n[1/4] 边缘环分割...\n";
        auto edge_loops = detectEdgeLoops(V, F, 30.0);
        std::cout << "  检测到 " << edge_loops.size() << " 个边环\n";
        auto islands = segmentByEdgeLoops(V, F, edge_loops);
        print_seams("边缘环分割", islands, F);
    } catch (const std::exception& e) {
        std::cout << "✗ 失败: " << e.what() << "\n";
    }
    
    // 2. 高曲率分割
    try {
        std::cout << "\n[2/4] 高曲率分割...\n";
        auto islands = segmentByHighCurvature(V, F, 0.5);
        print_seams("高曲率分割", islands, F);
    } catch (const std::exception& e) {
        std::cout << "✗ 失败: " << e.what() << "\n";
    }
    
    // 3. 高斯曲率分割
    try {
        std::cout << "\n[3/4] 高斯曲率分割...\n";
        auto islands = segmentByGaussianCurvature(V, F, 0.01);
        print_seams("高斯曲率分割", islands, F);
    } catch (const std::exception& e) {
        std::cout << "✗ 失败: " << e.what() << "\n";
    }
    
    // 4. 对称分割（假设YZ平面对称）
    try {
        std::cout << "\n[4/4] 对称分割 (x=0平面)...\n";
        Eigen::Vector4d plane(1, 0, 0, 0); // x = 0平面
        auto islands = segmentBySymmetry(V, F, plane, 0.01);
        print_seams("对称分割", islands, F);
    } catch (const std::exception& e) {
        std::cout << "✗ 失败: " << e.what() << "\n";
    }
    
    std::cout << "\n========================================\n";
    std::cout << "完成！\n";
    std::cout << "========================================\n";
    
    return 0;
}
