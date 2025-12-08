#include <iostream>
#include <fstream>
#include <iomanip>
#include <vector>

#include <igl/read_triangle_mesh.h>

#include "uv_geodesic.h"

int main(int argc, char* argv[]) {
    if (argc < 4) {
        std::cout << "用法: " << argv[0] << " <mesh.obj> <source_vertex> <target_vertex> [output.json]\n";
        return 1;
    }

    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    if (!igl::read_triangle_mesh(argv[1], V, F)) {
        std::cerr << "无法读取网格: " << argv[1] << "\n";
        return 1;
    }

    const int source = std::stoi(argv[2]);
    const int target = std::stoi(argv[3]);
    const std::string output = (argc > 4) ? argv[4] : "geodesic_path.json";

    try {
        UVGeodesic::HeatGeodesicSolver solver(V, F);
        Eigen::VectorXd distances = solver.computeDistance({source});
        UVGeodesic::GeodesicPath path = solver.tracePath(distances, source, target);

        std::cout << "✓ Heat Method geodesic computed.\n";
        std::cout << "  距离(field) @ target = " << path.length << "\n";
        std::cout << "  路径节点数: " << path.vertex_indices.size() << "\n";

        std::ofstream file(output);
        if (!file) {
            std::cerr << "无法写入: " << output << "\n";
            return 1;
        }

        file << "{\n  \"path\": [\n";
        for (std::size_t i = 0; i < path.polyline.size(); ++i) {
            const Eigen::Vector3d& p = path.polyline[i];
            file << "    { \"x\": " << std::setprecision(10) << p.x()
                 << ", \"y\": " << p.y()
                 << ", \"z\": " << p.z() << " }";
            if (i + 1 != path.polyline.size()) {
                file << ",";
            }
            file << "\n";
        }
        file << "  ]\n}\n";
        file.close();

        std::cout << "  路径已写入: " << output << "\n";
        std::cout << "  可直接在 Three.js 中使用 TubeGeometry 进行可视化。\n";
    } catch (const std::exception& e) {
        std::cerr << "失败: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
